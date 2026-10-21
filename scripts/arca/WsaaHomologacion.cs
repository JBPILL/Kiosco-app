using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Xml;
using System.Xml.Linq;

// Herramienta local. No es una pasarela fiscal ni autoriza comprobantes.
public static class WsaaHomologacion {
    public sealed class WsfeDiagnostic {
        public int Points { get; internal set; }
        public int BlockedPoints { get; internal set; }
    }
    public sealed class Ticket {
        public string Token { get; internal set; }
        public string Sign { get; internal set; }
        public DateTimeOffset Expiration { get; internal set; }
        public override string ToString() { return "Ticket WSAA (credenciales ocultas)"; }
    }

    public static string BuildTra(DateTimeOffset now, string service, uint uniqueId) {
        if (!Regex.IsMatch(service ?? "", "^[a-z][a-z0-9_]{0,63}$"))
            throw new ArgumentException("Servicio inválido.");
        return new XDocument(new XDeclaration("1.0", "UTF-8", null),
            new XElement("loginTicketRequest", new XAttribute("version", "1.0"),
                new XElement("header", new XElement("uniqueId", uniqueId),
                    new XElement("generationTime", now.AddMinutes(-5).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ")),
                    new XElement("expirationTime", now.AddMinutes(10).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ"))),
                new XElement("service", service))).ToString(SaveOptions.DisableFormatting);
    }

    public static byte[] SignTra(string certificatePath, string keyPath, SecureString password, string tra) {
        IntPtr pointer = Marshal.SecureStringToBSTR(password);
        char[] chars = new char[password.Length];
        try {
            Marshal.Copy(pointer, chars, 0, chars.Length);
            using var key = RSA.Create();
            key.ImportFromEncryptedPem(File.ReadAllText(keyPath), chars);
            using var certificate = X509Certificate2.CreateFromPem(File.ReadAllText(certificatePath));
            using var publicKey = certificate.GetRSAPublicKey();
            if (publicKey == null || !CryptographicOperations.FixedTimeEquals(
                key.ExportSubjectPublicKeyInfo(), publicKey.ExportSubjectPublicKeyInfo()))
                throw new CryptographicException("CERT_KEY_MISMATCH");
            var now = DateTime.UtcNow;
            if (now < certificate.NotBefore.ToUniversalTime() || now >= certificate.NotAfter.ToUniversalTime())
                throw new CryptographicException("CERT_NOT_CURRENT");
            // Restringir a un certificado emitido para Testing; nunca usar certificados productivos.
            if (!certificate.IssuerName.Decode(X500DistinguishedNameFlags.UseNewLines).Split('\n')
                .Any(part => part.Trim() == "CN=Computadores Test"))
                throw new CryptographicException("CERT_NOT_TESTING");
            var cms = new SignedCms(new ContentInfo(Encoding.UTF8.GetBytes(tra)), false);
            var signer = new CmsSigner(SubjectIdentifierType.IssuerAndSerialNumber, certificate) {
                PrivateKey = key,
                IncludeOption = X509IncludeOption.EndCertOnly,
                DigestAlgorithm = new Oid("2.16.840.1.101.3.4.2.1")
            };
            cms.ComputeSignature(signer, true);
            cms.CheckSignature(true);
            return cms.Encode();
        } finally { Array.Clear(chars, 0, chars.Length); Marshal.ZeroFreeBSTR(pointer); }
    }

    private static XDocument ReadXml(string xml) {
        if (xml == null || xml.Length > 1048576) throw new InvalidDataException("XML_SIZE");
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null,
            MaxCharactersInDocument = 1048576 };
        using var reader = XmlReader.Create(new StringReader(xml), settings);
        return XDocument.Load(reader);
    }
    private static string One(XContainer parent, string name) {
        var values = parent.Descendants().Where(e => e.Name.LocalName == name).ToArray();
        if (values.Length != 1 || values[0].HasElements) throw new InvalidDataException("XML_FIELD_" + name);
        return values[0].Value.Trim();
    }

    private static void CheckFault(XDocument envelope, string service) {
        if (envelope.Descendants().Any(e => e.Name.LocalName == "Fault")) {
            // Nunca propagar un faultstring remoto: puede reflejar entradas sensibles.
            var faultCode = envelope.Descendants().FirstOrDefault(e => e.Name.LocalName == "faultcode")?.Value ?? "UNKNOWN";
            var safeCode = Regex.IsMatch(faultCode, "^[a-zA-Z0-9_.:-]{1,100}$") ? faultCode : "UNKNOWN";
            throw new InvalidDataException(service + "_FAULT:" + safeCode);
        }
    }

    public static Ticket ParseResponse(string soap, DateTimeOffset now) {
        var envelope = ReadXml(soap);
        CheckFault(envelope, "WSAA");
        var response = ReadXml(One(envelope, "loginCmsReturn"));
        if (response.Root?.Name.LocalName != "loginTicketResponse") throw new InvalidDataException("TICKET_ROOT");
        var token = One(response, "token");
        var sign = One(response, "sign");
        if (token.Length == 0 || sign.Length == 0) throw new InvalidDataException("TICKET_CREDENTIALS");
        if (!DateTimeOffset.TryParse(One(response, "expirationTime"), System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var expiration) || expiration <= now)
            throw new InvalidDataException("TICKET_EXPIRATION");
        return new Ticket { Token = token, Sign = sign, Expiration = expiration };
    }

    public static Ticket Login(byte[] cms) {
        // Endpoint fijo, sin redirecciones ni opción de producción.
        var envelope = new XElement(XName.Get("Envelope", "http://schemas.xmlsoap.org/soap/envelope/"),
            new XElement(XName.Get("Body", "http://schemas.xmlsoap.org/soap/envelope/"),
                new XElement(XName.Get("loginCms", "http://wsaa.view.sua.dvadac.desein.afip.gov"),
                    new XElement("in0", Convert.ToBase64String(cms)))));
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://wsaahomo.afip.gov.ar/ws/services/LoginCms");
        request.Headers.Add("SOAPAction", "\"\"");
        request.Content = new StringContent(envelope.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml");
        var response = SendDiagnostic(request);
        var ticket = ParseResponse(response.Xml, DateTimeOffset.UtcNow);
        if (response.Status < 200 || response.Status >= 300) throw new InvalidDataException("WSAA_HTTP_" + response.Status);
        return ticket;
    }

    private static (string Xml, int Status) SendDiagnostic(HttpRequestMessage request) {
        using var handler = new HttpClientHandler { AllowAutoRedirect = false };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(40) };
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(40));
        using var response = client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token).GetAwaiter().GetResult();
        using var stream = response.Content.ReadAsStreamAsync(timeout.Token).GetAwaiter().GetResult();
        using var memory = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = stream.ReadAsync(buffer.AsMemory(), timeout.Token).AsTask().GetAwaiter().GetResult()) > 0) {
            if (memory.Length + read > 1048576) throw new InvalidDataException("XML_SIZE");
            memory.Write(buffer, 0, read);
        }
        return (Encoding.UTF8.GetString(memory.ToArray()), (int)response.StatusCode);
    }

    // Sólo construye una consulta de parámetros: no envía, persiste ni autoriza comprobantes.
    // El llamador debe usar el TA obtenido para wsfe, en el mismo proceso privado.
    public static HttpRequestMessage PrepareWsfeDiagnostic(Ticket ticket, string representedCuit, DateTimeOffset now) {
        if (ticket == null || ticket.Expiration <= now.AddMinutes(1))
            throw new InvalidDataException("TICKET_EXPIRATION");
        ValidateRepresentedCuit(representedCuit);
        XNamespace soap = "http://schemas.xmlsoap.org/soap/envelope/";
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        var envelope = new XElement(soap + "Envelope", new XElement(soap + "Body",
            new XElement(wsfe + "FEParamGetPtosVenta", new XElement(wsfe + "Auth",
                new XElement(wsfe + "Token", ticket.Token), new XElement(wsfe + "Sign", ticket.Sign),
                new XElement(wsfe + "Cuit", representedCuit)))));
        var request = new HttpRequestMessage(HttpMethod.Post, "https://wswhomo.afip.gov.ar/wsfev1/service.asmx");
        request.Headers.Add("SOAPAction", "\"http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta\"");
        request.Content = new StringContent(envelope.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml");
        return request;
    }

    public static void ValidateRepresentedCuit(string representedCuit) {
        if (!Regex.IsMatch(representedCuit ?? "", "^[0-9]{11}$"))
            throw new ArgumentException("CUIT representado inválido.");
        int[] weights = {5,4,3,2,7,6,5,4,3,2};
        int sum = 0;
        for (int i = 0; i < 10; i++) sum += (representedCuit[i] - '0') * weights[i];
        int digit = 11 - sum % 11;
        digit = digit == 11 ? 0 : digit == 10 ? 9 : digit;
        if (digit != representedCuit[10] - '0') throw new ArgumentException("CUIT representado inválido.");
    }

    public static WsfeDiagnostic ParseWsfeDiagnostic(string xml) {
        var envelope = ReadXml(xml);
        CheckFault(envelope, "WSFE");
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        XNamespace soap = "http://schemas.xmlsoap.org/soap/envelope/";
        if (envelope.Root?.Name != soap + "Envelope") throw new InvalidDataException("WSFE_RESULT");
        var bodies = envelope.Root.Elements(soap + "Body").ToArray();
        if (bodies.Length != 1) throw new InvalidDataException("WSFE_RESULT");
        var responses = bodies[0].Elements(wsfe + "FEParamGetPtosVentaResponse").ToArray();
        if (responses.Length != 1) throw new InvalidDataException("WSFE_RESULT");
        var results = responses[0].Elements(wsfe + "FEParamGetPtosVentaResult").ToArray();
        if (results.Length != 1) throw new InvalidDataException("WSFE_RESULT");
        var result = results[0];
        var errors = result.Descendants(wsfe + "Err").ToArray();
        if (errors.Length > 0) {
            var codes = errors.Take(10).Select(e => e.Element(wsfe + "Code")?.Value ?? "").ToArray();
            var safeCodes = codes.All(c => Regex.IsMatch(c, "^[0-9]{1,8}$")) ? String.Join(",", codes) : "UNKNOWN";
            throw new InvalidDataException("WSFE_BUSINESS:" + safeCodes);
        }
        var collections = result.Elements(wsfe + "ResultGet").ToArray();
        if (collections.Length != 1) throw new InvalidDataException("WSFE_RESULT");
        var points = collections[0].Elements(wsfe + "PtoVenta").ToArray();
        var numbers = new System.Collections.Generic.HashSet<int>();
        foreach (var point in points) {
            if (!Int32.TryParse(point.Element(wsfe + "Nro")?.Value, out var number) || number < 1 || number > 99999 || !numbers.Add(number))
                throw new InvalidDataException("WSFE_POINTS");
        }
        return new WsfeDiagnostic { Points = points.Length, BlockedPoints = points.Count(p => p.Element(wsfe + "Bloqueado")?.Value == "S") };
    }

    public static WsfeDiagnostic ConsultWsfe(Ticket ticket, string representedCuit) {
        using var request = PrepareWsfeDiagnostic(ticket, representedCuit, DateTimeOffset.UtcNow);
        var response = SendDiagnostic(request);
        var result = ParseWsfeDiagnostic(response.Xml);
        if (response.Status < 200 || response.Status >= 300) throw new InvalidDataException("WSFE_HTTP_" + response.Status);
        return result;
    }
}

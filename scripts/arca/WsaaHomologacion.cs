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
        public int VoucherTypes { get; internal set; }
        public WsfeParameter[] Parameters { get; internal set; } = Array.Empty<WsfeParameter>();
        public string SourceSha256 { get; internal set; } = "";
    }
    public sealed class WsfeParameter {
        public int Id { get; internal set; }
        public string Description { get; internal set; } = "";
        public string VoucherClasses { get; internal set; } = "";
        public string ValidFrom { get; internal set; } = "";
        public string ValidUntil { get; internal set; } = "";
    }
    public sealed class LastVoucherDiagnostic {
        public int Point { get; internal set; }
        public int VoucherType { get; internal set; }
        public int LastNumber { get; internal set; }
        public string SourceSha256 { get; internal set; } = "";
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
    public static HttpRequestMessage PrepareWsfeDiagnostic(Ticket ticket, string representedCuit, DateTimeOffset now, string operation = "FEParamGetPtosVenta") {
        ValidateWsfeOperation(operation);
        return PrepareReadRequest(ticket, representedCuit, now, operation);
    }

    private static HttpRequestMessage PrepareReadRequest(Ticket ticket, string representedCuit, DateTimeOffset now, string operation, params XElement[] fields) {
        if (ticket == null || ticket.Expiration <= now.AddMinutes(1))
            throw new InvalidDataException("TICKET_EXPIRATION");
        ValidateRepresentedCuit(representedCuit);
        XNamespace soap = "http://schemas.xmlsoap.org/soap/envelope/";
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        var envelope = new XElement(soap + "Envelope", new XElement(soap + "Body",
            new XElement(wsfe + operation, new XElement(wsfe + "Auth",
                new XElement(wsfe + "Token", ticket.Token), new XElement(wsfe + "Sign", ticket.Sign),
                new XElement(wsfe + "Cuit", representedCuit)), fields)));
        var request = new HttpRequestMessage(HttpMethod.Post, "https://wswhomo.afip.gov.ar/wsfev1/service.asmx");
        request.Headers.Add("SOAPAction", "\"http://ar.gov.afip.dif.FEV1/" + operation + "\"");
        request.Content = new StringContent(envelope.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml");
        return request;
    }

    public static void ValidateWsfeOperation(string operation) {
        if (operation != "FEParamGetPtosVenta" && operation != "FEParamGetTiposCbte"
            && operation != "FEParamGetTiposIva" && operation != "FEParamGetCondicionIvaReceptor")
            throw new ArgumentException("WSFE_OPERATION");
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

    private static XElement ReadWsfeResult(string xml, string operation) {
        var envelope = ReadXml(xml);
        CheckFault(envelope, "WSFE");
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        XNamespace soap = "http://schemas.xmlsoap.org/soap/envelope/";
        if (envelope.Root?.Name != soap + "Envelope") throw new InvalidDataException("WSFE_RESULT");
        var bodies = envelope.Root.Elements(soap + "Body").ToArray();
        if (bodies.Length != 1 || bodies[0].Elements().Count() != 1) throw new InvalidDataException("WSFE_RESULT");
        var responses = bodies[0].Elements(wsfe + operation + "Response").ToArray();
        if (responses.Length != 1) throw new InvalidDataException("WSFE_RESULT");
        var results = responses[0].Elements(wsfe + operation + "Result").ToArray();
        if (results.Length != 1 || responses[0].Elements().Count() != 1) throw new InvalidDataException("WSFE_RESULT");
        var result = results[0];
        var errors = result.Descendants(wsfe + "Err").ToArray();
        if (errors.Length > 0) {
            var codes = errors.Take(10).Select(e => e.Element(wsfe + "Code")?.Value ?? "").ToArray();
            var safeCodes = codes.All(c => Regex.IsMatch(c, "^[0-9]{1,8}$")) ? String.Join(",", codes) : "UNKNOWN";
            throw new InvalidDataException("WSFE_BUSINESS:" + safeCodes);
        }
        return result;
    }

    public static WsfeDiagnostic ParseWsfeDiagnostic(string xml, string operation = "FEParamGetPtosVenta") {
        ValidateWsfeOperation(operation);
        var result = ReadWsfeResult(xml, operation);
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        var collections = result.Elements(wsfe + "ResultGet").ToArray();
        if (collections.Length != 1) throw new InvalidDataException("WSFE_RESULT");
        if (operation == "FEParamGetTiposIva" || operation == "FEParamGetCondicionIvaReceptor") {
            bool conditions = operation == "FEParamGetCondicionIvaReceptor";
            string[] fields = conditions ? new[] {"Id", "Desc", "Cmp_Clase"} : new[] {"Id", "Desc", "FchDesde", "FchHasta"};
            var rows = collections[0].Elements(wsfe + (conditions ? "CondicionIvaReceptor" : "IvaTipo")).ToArray();
            if (rows.Length < 1 || rows.Length > 100 || collections[0].Elements().Count() != rows.Length)
                throw new InvalidDataException("WSFE_PARAMETERS");
            var parameters = new System.Collections.Generic.List<WsfeParameter>();
            var seen = new System.Collections.Generic.HashSet<string>();
            foreach (var row in rows) {
                if (row.Elements().Count() != fields.Length || fields.Any(f => row.Elements(wsfe + f).Count() != 1)
                    || row.Elements().Any(f => f.HasElements || f.Attributes().Any())) throw new InvalidDataException("WSFE_PARAMETERS");
                string description = row.Element(wsfe + "Desc").Value;
                if (!Int32.TryParse(row.Element(wsfe + "Id").Value, out var id) || id < 1 || id > 99
                    || String.IsNullOrWhiteSpace(description) || description.Length > 120 || description.Any(Char.IsControl))
                    throw new InvalidDataException("WSFE_PARAMETERS");
                var parameter = new WsfeParameter { Id = id, Description = description };
                if (conditions) {
                    parameter.VoucherClasses = row.Element(wsfe + "Cmp_Clase").Value;
                    if (!Regex.IsMatch(parameter.VoucherClasses, "^[A-Z0-9 ,/]{1,32}$")) throw new InvalidDataException("WSFE_PARAMETERS");
                } else {
                    parameter.ValidFrom = row.Element(wsfe + "FchDesde").Value;
                    parameter.ValidUntil = row.Element(wsfe + "FchHasta").Value;
                    foreach (var date in new[] { parameter.ValidFrom, parameter.ValidUntil }) {
                        if (date != "NULL" && !DateTime.TryParseExact(date, "yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture,
                            System.Globalization.DateTimeStyles.None, out _)) throw new InvalidDataException("WSFE_PARAMETERS");
                    }
                }
                if (!seen.Add(id + ":" + parameter.VoucherClasses)) throw new InvalidDataException("WSFE_PARAMETERS");
                parameters.Add(parameter);
            }
            return new WsfeDiagnostic { Parameters = parameters.ToArray(),
                SourceSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(xml))).ToLowerInvariant() };
        }
        if (operation == "FEParamGetTiposCbte") {
            var types = collections[0].Elements(wsfe + "CbteTipo").ToArray();
            var ids = new System.Collections.Generic.HashSet<int>();
            if (types.Length == 0 || collections[0].Elements().Count() != types.Length)
                throw new InvalidDataException("WSFE_TYPES");
            foreach (var type in types) {
                var fields = type.Elements(wsfe + "Id").ToArray();
                var descriptions = type.Elements(wsfe + "Desc").ToArray();
                if (fields.Length != 1 || fields[0].HasElements ||
                    !Int32.TryParse(fields[0].Value, out var id) || id < 1 || !ids.Add(id) ||
                    descriptions.Length != 1 || descriptions[0].HasElements || String.IsNullOrWhiteSpace(descriptions[0].Value))
                    throw new InvalidDataException("WSFE_TYPES");
            }
            return new WsfeDiagnostic { VoucherTypes = types.Length };
        }
        var points = collections[0].Elements(wsfe + "PtoVenta").ToArray();
        var numbers = new System.Collections.Generic.HashSet<int>();
        foreach (var point in points) {
            if (!Int32.TryParse(point.Element(wsfe + "Nro")?.Value, out var number) || number < 1 || number > 99999 || !numbers.Add(number))
                throw new InvalidDataException("WSFE_POINTS");
        }
        return new WsfeDiagnostic { Points = points.Length, BlockedPoints = points.Count(p => p.Element(wsfe + "Bloqueado")?.Value == "S") };
    }

    public static WsfeDiagnostic ConsultWsfe(Ticket ticket, string representedCuit, string operation = "FEParamGetPtosVenta") {
        using var request = PrepareWsfeDiagnostic(ticket, representedCuit, DateTimeOffset.UtcNow, operation);
        var response = SendDiagnostic(request);
        var result = ParseWsfeDiagnostic(response.Xml, operation);
        if (response.Status < 200 || response.Status >= 300) throw new InvalidDataException("WSFE_HTTP_" + response.Status);
        return result;
    }

    public static void ValidateLastVoucherScope(int point, int voucherType) {
        if (point < 1 || point > 99998 || (voucherType != 1 && voucherType != 6 && voucherType != 11))
            throw new ArgumentException("WSFE_LAST_SCOPE");
    }

    public static HttpRequestMessage PrepareLastVoucherDiagnostic(Ticket ticket, string representedCuit, DateTimeOffset now, int point, int voucherType) {
        ValidateLastVoucherScope(point, voucherType);
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        return PrepareReadRequest(ticket, representedCuit, now, "FECompUltimoAutorizado",
            new XElement(wsfe + "PtoVta", point), new XElement(wsfe + "CbteTipo", voucherType));
    }

    public static LastVoucherDiagnostic ParseLastVoucherDiagnostic(string xml, int point, int voucherType) {
        ValidateLastVoucherScope(point, voucherType);
        var result = ReadWsfeResult(xml, "FECompUltimoAutorizado");
        XNamespace wsfe = "http://ar.gov.afip.dif.FEV1/";
        string[] fields = { "PtoVta", "CbteTipo", "CbteNro" };
        if (result.Attributes().Any() || result.Elements().Any(e => e.Name.Namespace != wsfe
            || (!fields.Contains(e.Name.LocalName) && e.Name.LocalName != "Errors" && e.Name.LocalName != "Events")))
            throw new InvalidDataException("WSFE_LAST_RESULT");
        foreach (var optional in new[] { "Errors", "Events" }) {
            if (result.Elements(wsfe + optional).Count() > 1) throw new InvalidDataException("WSFE_LAST_RESULT");
        }
        var emptyErrors = result.Element(wsfe + "Errors");
        if (emptyErrors != null && (emptyErrors.HasElements || !String.IsNullOrWhiteSpace(emptyErrors.Value) || emptyErrors.Attributes().Any()))
            throw new InvalidDataException("WSFE_LAST_RESULT");
        int[] values = new int[3];
        for (int i = 0; i < fields.Length; i++) {
            var nodes = result.Elements(wsfe + fields[i]).ToArray();
            if (nodes.Length != 1 || nodes[0].HasElements || nodes[0].Attributes().Any()
                || !Regex.IsMatch(nodes[0].Value, "^[0-9]{1,8}$") || !Int32.TryParse(nodes[0].Value, out values[i]))
                throw new InvalidDataException("WSFE_LAST_RESULT");
        }
        if (values[0] != point || values[1] != voucherType || values[2] > 99999999)
            throw new InvalidDataException("WSFE_LAST_RESULT");
        return new LastVoucherDiagnostic { Point = point, VoucherType = voucherType, LastNumber = values[2],
            SourceSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(xml))).ToLowerInvariant() };
    }

    // A successful read is not proof of habilitation, reserved numbering or permission to issue.
    public static LastVoucherDiagnostic ConsultLastVoucher(Ticket ticket, string representedCuit, int point, int voucherType) {
        using var request = PrepareLastVoucherDiagnostic(ticket, representedCuit, DateTimeOffset.UtcNow, point, voucherType);
        var response = SendDiagnostic(request);
        var result = ParseLastVoucherDiagnostic(response.Xml, point, voucherType);
        if (response.Status < 200 || response.Status >= 300) throw new InvalidDataException("WSFE_HTTP_" + response.Status);
        return result;
    }

    // Exports only parsed public parameter fields, never SOAP or Auth credentials.
    // This is source evidence; it does not map classes, set IVA or enable an issuer.
    public static void WriteParameterEvidence(WsfeDiagnostic diagnostic, Ticket ticket, string operation, DateTimeOffset consultedAt, string path) {
        if ((operation != "FEParamGetTiposIva" && operation != "FEParamGetCondicionIvaReceptor")
            || diagnostic == null || diagnostic.Parameters.Length < 1 || ticket == null
            || String.IsNullOrEmpty(ticket.Token) || String.IsNullOrEmpty(ticket.Sign)
            || !Regex.IsMatch(diagnostic.SourceSha256, "^[0-9a-f]{64}$")) throw new InvalidDataException("WSFE_PARAMETERS");
        foreach (var row in diagnostic.Parameters) {
            foreach (var value in new[] { row.Description, row.VoucherClasses, row.ValidFrom, row.ValidUntil }) {
                if (value.Contains(ticket.Token) || value.Contains(ticket.Sign)) throw new InvalidDataException("WSFE_PARAMETERS");
            }
        }
        var destination = Path.GetFullPath(path);
        if (!destination.EndsWith(".json", StringComparison.OrdinalIgnoreCase) || !Directory.Exists(Path.GetDirectoryName(destination)))
            throw new InvalidDataException("WSFE_PARAMETER_DESTINATION");
        string json = System.Text.Json.JsonSerializer.Serialize(new {
            version = 1, entorno = "HOMOLOGACION", operacion = operation,
            origen = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
            consultado_en = consultedAt.ToUniversalTime().ToString("o"),
            respuesta_sha256 = diagnostic.SourceSha256, parametros = diagnostic.Parameters,
            importado_en_staging = false, emision_habilitada = false
        });
        using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        var bytes = Encoding.UTF8.GetBytes(json);
        output.Write(bytes, 0, bytes.Length);
        output.Flush(true);
    }
}

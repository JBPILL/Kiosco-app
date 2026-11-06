export function diagnoseFiscalOwnerClosed(credentials: {email:string;password:string;publicKey:string}, options?: {fetcher?:typeof fetch;now?:()=>number}):Promise<string>

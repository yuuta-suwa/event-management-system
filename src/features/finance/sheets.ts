import {createSign} from "node:crypto";
function sheetsConfig(){
  const clientEmail=process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey=process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g,"\n");
  const spreadsheetId=process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if(!clientEmail||!privateKey||!spreadsheetId)throw new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
  return {clientEmail,privateKey,spreadsheetId,sheetName:process.env.GOOGLE_SHEETS_SHEET_NAME||"収支"};
}
function base64url(input:string){return Buffer.from(input).toString("base64url")}
async function getAccessToken(clientEmail:string,privateKey:string){
  const now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const claim=base64url(JSON.stringify({iss:clientEmail,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const unsigned=`${header}.${claim}`;
  const signature=createSign("RSA-SHA256").update(unsigned).sign(privateKey,"base64url");
  const jwt=`${unsigned}.${signature}`;
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});
  if(!response.ok)throw new Error(`GOOGLE_AUTH_${response.status}:${(await response.text()).slice(0,200)}`);
  const data=await response.json() as {access_token:string};
  return data.access_token;
}
export async function writeFinanceSheet(rows:(string|number)[][]){
  const {clientEmail,privateKey,spreadsheetId,sheetName}=sheetsConfig();
  const token=await getAccessToken(clientEmail,privateKey);
  const range=encodeURIComponent(`${sheetName}!A1`);
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({values:rows})});
  if(!response.ok)throw new Error(`GOOGLE_SHEETS_${response.status}:${(await response.text()).slice(0,200)}`);
}

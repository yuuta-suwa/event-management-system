function sheetsConfig(){
  const clientId=process.env.GOOGLE_SHEETS_CLIENT_ID;
  const clientSecret=process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  const refreshToken=process.env.GOOGLE_SHEETS_REFRESH_TOKEN;
  const spreadsheetId=process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if(!clientId||!clientSecret||!refreshToken||!spreadsheetId)throw new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
  return {clientId,clientSecret,refreshToken,spreadsheetId,sheetName:process.env.GOOGLE_SHEETS_SHEET_NAME||"収支"};
}
async function getAccessToken(clientId:string,clientSecret:string,refreshToken:string){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
  if(!response.ok)throw new Error(`GOOGLE_AUTH_${response.status}:${(await response.text()).slice(0,200)}`);
  const data=await response.json() as {access_token:string};
  return data.access_token;
}
export async function writeFinanceSheet(rows:(string|number)[][]){
  const {clientId,clientSecret,refreshToken,spreadsheetId,sheetName}=sheetsConfig();
  const token=await getAccessToken(clientId,clientSecret,refreshToken);
  const range=encodeURIComponent(`${sheetName}!A1`);
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({values:rows})});
  if(!response.ok)throw new Error(`GOOGLE_SHEETS_${response.status}:${(await response.text()).slice(0,200)}`);
}

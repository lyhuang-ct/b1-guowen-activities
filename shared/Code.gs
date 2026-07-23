/**
 * ============================================================
 * 高一國文 B1 活動統一後端（Google Apps Script）
 * ============================================================
 * 設定步驟：
 * 1. 新建一個 Google 試算表，建立工作表分頁：B1L1、B1L2、B1L3、B1L4、B1L5、B1L7、B1L8、B1L9、B1L10
 *    （沒有的分頁會在第一次寫入時自動建立）
 * 2. 在 Google 雲端硬碟新建資料夾「B1活動截圖」，複製資料夾 ID
 *    （網址 https://drive.google.com/drive/folders/【這裡就是FOLDER_ID】）
 * 3. 擴充功能 → Apps Script，貼上本檔全部內容
 * 4. 填寫下方 SPREADSHEET_ID、DRIVE_FOLDER_ID
 * 5. 部署 → 新增部署作業 → 類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 具有存取權的使用者：任何人
 * 6. 複製網頁應用程式 URL，貼到專案 shared/config.js 的 GAS_URL
 *
 * 截圖檔名格式：班級_座號_活動名稱_姓名_yyyymmdd.png
 * ============================================================
 */

// ★ 請改成您的試算表 ID（試算表網址 /d/ 與 /edit 之間那段）
// 例：https://docs.google.com/spreadsheets/d/【這一段】/edit
var SPREADSHEET_ID = '1UcG8goh_760N1QVKufCNtflZLL1WUsLDGyBgvur6PK4';

// ★ 雲端硬碟資料夾 ID（所有活動截圖集中放這裡）
// 例：https://drive.google.com/drive/folders/【這一段】
var DRIVE_FOLDER_ID = '1EC5I78tMQcGa142kskwwDRx9fzPQwx_h';

function assertConfig_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf('請填入') === 0) {
    throw new Error('尚未設定 SPREADSHEET_ID（試算表 ID）');
  }
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf('請填入') === 0) {
    throw new Error('尚未設定 DRIVE_FOLDER_ID（雲端硬碟資料夾 ID）');
  }
}

var SHEET_HEADERS = ['作答時間', '班級', '座號', '姓名', '活動名稱', '結果', '補充資訊', '截圖檔名', '截圖連結'];

function doPost(e) {
  try {
    assertConfig_();
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    var className = String(data.className || '');
    var seat = String(data.seat || '');
    var name = String(data.name || '');
    var activityId = String(data.activityId || '其他');
    var activityName = String(data.activityName || activityId);
    var result = String(data.result || '');
    var extra = String(data.extra || '');
    var fileName = String(data.fileName || buildDefaultFileName_(className, seat, activityName, name));
    var answeredAt = data.answeredAt ? new Date(data.answeredAt) : new Date();
    if (isNaN(answeredAt.getTime())) answeredAt = new Date();

    var fileUrl = '';
    if (data.imageBase64) {
      fileUrl = saveScreenshot_(data.imageBase64, fileName);
    }

    appendResultRow_(activityId, [
      Utilities.formatDate(answeredAt, Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss'),
      className,
      seat,
      name,
      activityName,
      result,
      extra,
      fileName,
      fileUrl
    ]);

    return jsonOut_({ ok: true, fileName: fileName, fileUrl: fileUrl });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doGet() {
  var configOk = true;
  var configError = '';
  try {
    assertConfig_();
  } catch (err) {
    configOk = false;
    configError = String(err);
  }
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      message: 'B1 活動統一後端運作中。請由活動網頁以 POST 送出資料。',
      configOk: configOk,
      configError: configError
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildDefaultFileName_(className, seat, activityName, name) {
  var d = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyyMMdd');
  return [className, seat, activityName, name, d]
    .map(function (s) {
      return String(s || '未知').replace(/[\\/:*?"<>|\s]+/g, '_');
    })
    .join('_') + '.png';
}

function saveScreenshot_(imageBase64, fileName) {
  var base64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, 'image/png', fileName);
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var file = folder.createFile(blob);
  file.setName(fileName);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (ignore) {}
  return file.getUrl();
}

function appendResultRow_(sheetName, row) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setFontWeight('bold');
  }
  sheet.appendRow(row);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

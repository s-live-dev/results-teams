// テスト用URL
// https://script.google.com/a/macros/s-live.app/s/AKfycbw30nl9TJx5dt01rZaRlPDszm260hdevMhxZfkj0jCz/dev?s=1aeQHkdd8_9a2WdO5zVo5eXxGyrLezJEJrjbxyUlTkT4

// S-LIVE 団体戦結果システム - Cursor開発環境テスト
// 最終更新: 2025/07/18 - CSS分離対応

/**
 * WebページとしてアクセスされたときにHTMLを返す
 * @param {object} e - イベントオブジェクト
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  // URLパラメータからスプレッドシートIDのみを取得してテンプレートに渡す
  template.s = e.parameter.s || '';

  return template.evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * 他のHTMLファイル（CSS、JSなど）をインクルードするためのヘルパー関数
 * @param {string} filename - インクルードするファイル名
 * @returns {string} ファイルの内容
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * HTML側から呼び出され、団体戦の全データをJSONオブジェクトとして返す
 * @param {string} s - スプレッドシートID
 * @returns {object} 大会情報、競技別団体、総合団体のデータを含むオブジェクト
 */
function getTeamData(s) {
  if (!s) {
    const errorMessage = "Error: Spreadsheet ID(s) is missing.";
    console.error(errorMessage);
    return { error: errorMessage };
  }

  try {
    const ss = SpreadsheetApp.openById(s);
    // シート名を固定で指定
    const trapSheet = ss.getSheetByName("トラップ");
    const skeetSheet = ss.getSheetByName("スキート");

    if (!trapSheet) return { error: `Sheet "トラップ" not found.` };
    if (!skeetSheet) return { error: `Sheet "スキート" not found.` };

    // 大会情報はsパラメータのみで取得
    const eventInfo = getEventInfoFromSheet(s);

    // 各シートから選手データをパース
    const trapPlayers = parsePlayersData(trapSheet, 'trap');
    const skeetPlayers = parsePlayersData(skeetSheet, 'skeet');
    const allPlayers = [...trapPlayers, ...skeetPlayers];

    // 団体戦の結果を計算
    const teamResults = calculateTeamResults(allPlayers);

    // 最終的なデータオブジェクトを構築して返す
    return {
      eventInfo: eventInfo,
      teamEvent: {
        trap: teamResults.eventTrap,
        skeet: teamResults.eventSkeet
      },
      teamOverall: teamResults.overall
    };

  } catch (e) {
    console.error("getTeamData Error: " + e.message + " Stack: " + e.stack);
    return { error: e.toString() };
  }
}

/**
 * オリジナルの getEventInfoData をベースに団体戦用に調整
 * @param {string} s - スプレッドシートID
 * @returns {object} 大会情報オブジェクト
 */
function getEventInfoFromSheet(s) {
  // オリジナルと同じく「大会情報」シートから取得
  var sheet = SpreadsheetApp.openById(s).getSheetByName('大会情報');
  var eData = sheet.getDataRange().getValues().slice(1, 3); // 最大2件のデータを取得

  // eData から列　主催協会:[0] が空の行を削除
  eData = eData.filter(function (row) {
    return row[0] !== ''; // インデックス0の列が空ではない行だけを残す
  });

  if (eData.length === 0) {
    // データがない場合のデフォルト値
    return {
      name: "団体戦結果",
      flagUrl: "",
      place: "",
      date: "",
      days: "",
      weather: "",
      lastUpdate: "最終更新: " + new Date().toLocaleTimeString('ja-JP'),
      qrCodeUrl: "",
      status: {
        trap: "---",
        skeet: "---"
      }
    };
  }

  // 最初の行のデータを使用（オリジナルと同じ構造）
  var row = eData[0];

  // OpenWeatherMap APIから気象情報を取得（オリジナルと同じ）
  var weatherData;
  try {
    var location = row[7].split(',');
    var latitude = parseFloat(location[0].trim());
    var longitude = parseFloat(location[1].trim());
    var apiKey = PropertiesService.getScriptProperties().getProperty('AK_openWeather');
    var url = `https://api.openweathermap.org/data/2.5/weather?units=metric&lat=${latitude}&lon=${longitude}&appid=${apiKey}`;
    var response = UrlFetchApp.fetch(url);
    var json = response.getContentText();
    weatherData = JSON.parse(json);
  } catch (error) {
    weatherData = {
      weather: [{ description: 'N/A ' }],
      main: { temp: 'N/A ', humidity: 'N/A ', pressure: 'N/A ' },
      wind: { speed: 'N/A ' }
    };
    console.log('S-LIVE: caught an error,set default values:', error);
  }

  // 団体戦用のQRコード生成（オリジナルのQR Server APIを使用）
  var teamResultsUrl = `${ScriptApp.getService().getUrl()}?s=${s}`;
  var qrCodeUrl = "https://api.qrserver.com/v1/create-qr-code/?data=" +
    encodeURIComponent(teamResultsUrl) +
    '&format=png&margin=10&size=150x150';

  // オリジナルの形式でデータを構築
  return {
    name: row[1], // 大会名
    flagUrl: 'https://s-live.org/wp-content/plugins/s-live/resource/flag/' + encodeURIComponent(row[0]) + '.png',
    place: row[6], // 場所
    date: '<i class="fa-regular fa-calendar-days"></i> ' + Utilities.formatDate(new Date(row[5]), "Asia/Tokyo", "yy/MM/dd"),
    days: row[4] + 'Day(s)',
    weather: '<i class="fa-solid fa-sun"></i> ' + weatherData.weather[0].description + ' ' +
      '<i class="fa-solid fa-temperature-three-quarters"></i> ' + weatherData.main.temp + 'c ' +
      '<i class="fa-solid fa-droplet"></i> ' + weatherData.main.humidity + '% ' +
      '<i class="fa-solid fa-wind"></i> ' + weatherData.wind.speed + 'm/s ' +
      '<i class="fa-solid fa-gauge-simple"></i> ' + weatherData.main.pressure + 'hPa',
    lastUpdate: '<i class="fa-regular fa-clock"></i> ' + Utilities.formatDate(new Date(row[2]), 'Asia/Tokyo', "yy/MM/dd HH:mm"),
    qrCodeUrl: qrCodeUrl,
    status: {
      trap: row[3] || "---", // 状況
      skeet: row[3] || "---"  // 団体戦では同じ状況を想定
    }
  };
}

/**
 * シートから選手データをパースしてオブジェクトの配列を返す
 * @param {Sheet} sheet - スプレッドシートのシートオブジェクト
 * @param {string} discipline - 'trap' または 'skeet'
 * @returns {Array<object>} 選手オブジェクトの配列
 */
function parsePlayersData(sheet, discipline) {
  const data = sheet.getRange("A2:W" + sheet.getLastRow()).getValues();
  const players = [];

  data.forEach(row => {
    if (!row[5] || !row[6]) return; // 氏名(F列)と所属(G列)が空ならスキップ
    players.push({
      discipline: discipline,
      team: row[6], // G列: 所属
      name: row[5], // F列: 氏名
      r1: Number(row[7]) || 0,
      r2: Number(row[8]) || 0,
      r3: Number(row[9]) || 0,
      r4: Number(row[10]) || 0,
      total: Number(row[17]) || 0 // R列: GT
    });
  });
  return players;
}

/**
 * 選手データから団体戦の結果を計算する
 * @param {Array<object>} players - 全選手オブジェクトの配列
 * @returns {object} 計算された団体戦の結果
 */
function calculateTeamResults(players) {
  const teams = players.reduce((acc, player) => {
    if (!acc[player.team]) {
      acc[player.team] = { trap: [], skeet: [] };
    }
    acc[player.team][player.discipline].push(player);
    return acc;
  }, {});

  const eventTrap = [], eventSkeet = [], overall = [];

  for (const teamName in teams) {
    const teamPlayers = teams[teamName];
    teamPlayers.trap.sort((a, b) => b.total - a.total);
    teamPlayers.skeet.sort((a, b) => b.total - a.total);

    const eventTrapPlayers = teamPlayers.trap.slice(0, 3);
    if (eventTrapPlayers.length > 0) {
      eventTrap.push({
        name: teamName,
        total: eventTrapPlayers.reduce((sum, p) => sum + p.total, 0),
        players: eventTrapPlayers.map((p, i) => ({ ...p, rank: i + 1 }))
      });
    }

    const eventSkeetPlayers = teamPlayers.skeet.slice(0, 3);
    if (eventSkeetPlayers.length > 0) {
      eventSkeet.push({
        name: teamName,
        total: eventSkeetPlayers.reduce((sum, p) => sum + p.total, 0),
        players: eventSkeetPlayers.map((p, i) => ({ ...p, rank: i + 1 }))
      });
    }

    const overallTrapPlayers = teamPlayers.trap.slice(0, 5);
    const overallSkeetPlayers = teamPlayers.skeet.slice(0, 3);

    if (overallTrapPlayers.length > 0 || overallSkeetPlayers.length > 0) {
      const trapTotal = overallTrapPlayers.reduce((sum, p) => sum + p.total, 0);
      const skeetTotal = overallSkeetPlayers.reduce((sum, p) => sum + p.total, 0);
      overall.push({
        name: teamName,
        trapTotal: trapTotal,
        skeetTotal: skeetTotal,
        overallTotal: trapTotal + skeetTotal,
        trapPlayers: overallTrapPlayers.map((p, i) => ({
          name: p.name,
          total: p.total,
          rank: i + 1,
          r1: p.r1,
          r2: p.r2,
          r3: p.r3,
          r4: p.r4
        })),
        skeetPlayers: overallSkeetPlayers.map((p, i) => ({
          name: p.name,
          total: p.total,
          rank: i + 1,
          r1: p.r1,
          r2: p.r2,
          r3: p.r3,
          r4: p.r4
        }))
      });
    }
  }

  eventTrap.sort((a, b) => b.total - a.total).forEach((t, i) => t.rank = i + 1);
  eventSkeet.sort((a, b) => b.total - a.total).forEach((t, i) => t.rank = i + 1);
  overall.sort((a, b) => b.overallTotal - a.overallTotal).forEach((t, i) => t.rank = i + 1);

  return { eventTrap, eventSkeet, overall };
}
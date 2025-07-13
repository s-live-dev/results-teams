/**
 * WebページとしてアクセスされたときにHTMLを返す
 * @param {object} e - イベントオブジェクト
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  // URLパラメータからスプレッドシートIDのみを取得してテンプレートに渡す
  template.s = e.parameter.s || ''; 

  return template.evaluate()
      .setTitle('S-LIVE Results - 団体戦')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
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
    
    // 大会情報はトラップシートから取得することを基本とする
    const eventInfo = getEventInfoFromSheet(trapSheet, s);
    
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
 * シートから大会情報を取得してオブジェクトとして返す
 * @param {Sheet} primarySheet - 大会情報の基準となるシートオブジェクト
 * @param {string} s - スプレッドシートID
 * @returns {object} 大会情報オブジェクト
 */
function getEventInfoFromSheet(primarySheet, s) {
    const infoData = primarySheet.getRange("AA1:AB6").getValues();
    const infoMap = new Map(infoData.map(row => [row[0], row[1]]));

    const url = `${ScriptApp.getService().getUrl()}?s=${s}`;

    return {
        name: infoMap.get("大会名") || `団体戦結果`,
        flagUrl: infoMap.get("旗") || "",
        place: infoMap.get("場所") || "",
        date: infoMap.get("開催日") || "",
        days: infoMap.get("日数") || "",
        weather: infoMap.get("気象") || "",
        lastUpdate: "最終更新: " + new Date().toLocaleTimeString('ja-JP'),
        qrCodeUrl: `https://chart.googleapis.com/chart?cht=qr&chs=150x150&chl=${encodeURIComponent(url)}`,
        status: {
            trap: infoMap.get("トラップ状況") || "---",
            skeet: infoMap.get("スキート状況") || "---"
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
                trapPlayers: overallTrapPlayers.map((p, i) => ({ name: p.name, total: p.total, rank: i + 1 })),
                skeetPlayers: overallSkeetPlayers.map((p, i) => ({ name: p.name, total: p.total, rank: i + 1 }))
            });
        }
    }

    eventTrap.sort((a, b) => b.total - a.total).forEach((t, i) => t.rank = i + 1);
    eventSkeet.sort((a, b) => b.total - a.total).forEach((t, i) => t.rank = i + 1);
    overall.sort((a, b) => b.overallTotal - a.overallTotal).forEach((t, i) => t.rank = i + 1);

    return { eventTrap, eventSkeet, overall };
}

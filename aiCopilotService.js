const { GoogleGenAI } = require('@google/genai');

/**
 * FREYA Autonomous Industrial Copilot Service
 * Connects Google Gemini 3.6 Flash with MongoDB Atlas to analyze manufacturing data
 * and dynamically reconfigure dashboard layout cards.
 */

const VALID_CARDS = ["production", "defects", "camera", "telemetry", "issues", "finance"];

// Tool definitions for Gemini
const COPILOT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "getActiveWorkers",
        description: "Fetch list of active operators and workers on the factory floor today from tabletLogDB, including their assigned machines, batches, and factory.",
        parameters: {
          type: "OBJECT",
          properties: {
            factory: { type: "STRING", description: "Optional factory filter: '小瀬' (Kose / Oze) or '倉知' (Kurachi) or '第二工場' or '肥田瀬'" },
            limit: { type: "NUMBER", description: "Max number of workers to return (default 25)" }
          }
        }
      },
      {
        name: "getActiveSebanggo",
        description: "Fetch live active 背番号 (Sebanggo), Hinban (品番 / Part Numbers), and part models currently being processed today in the factory from tabletLogDB, with their assigned machines, operators, batches run, and factory.",
        parameters: {
          type: "OBJECT",
          properties: {
            factory: { type: "STRING", description: "Optional factory filter: '小瀬' (Kose / Oze) or '倉知' (Kurachi) or '第二工場' or '肥田瀬'" },
            limit: { type: "NUMBER", description: "Max number of 背番号 to return (default 30)" }
          }
        }
      },
      {
        name: "getTopDefects",
        description: "Fetch top non-conformance defect records from MongoDB for today or recent batches, including Hinban (品番), Sebanggo (背番号), process, NG count, and trouble hours.",
        parameters: {
          type: "OBJECT",
          properties: {
            factory: { type: "STRING", description: "Optional factory filter: '小瀬' (Kose) or '倉知' (Kurachi)" },
            process: { type: "STRING", description: "Optional process filter: 'Kensa', 'Press', 'Slit', 'SRS'" },
            limit: { type: "NUMBER", description: "Number of defect records to return (default 5)" }
          }
        }
      },
      {
        name: "getMachineDowntime",
        description: "Fetch machine downtime, trouble hours, and stoppage tickets from tabletLogDB in MongoDB.",
        parameters: {
          type: "OBJECT",
          properties: {
            factory: { type: "STRING", description: "Optional factory: '小瀬' or '倉知'" },
            limit: { type: "NUMBER", description: "Max logs to retrieve (default 5)" }
          }
        }
      },
      {
        name: "getFactorySummary",
        description: "Fetch aggregate production volume, total NG scrap units, and trouble hours by factory for today.",
        parameters: {
          type: "OBJECT",
          properties: {
            factory: { type: "STRING", description: "Optional factory: '小瀬' or '倉知'" }
          }
        }
      }
    ]
  }
];

const SYSTEM_INSTRUCTION = `You are FREYA Copilot, an autonomous industrial manufacturing AI assistant for Sasaki Coating factories (小瀬 / Kose / Oze and 倉知 / Kurachi).
You assist plant managers, maintenance engineers, and executives by inspecting live production data, active personnel on shift, quality defects, machine telemetry, and financials.

Available Dashboard Cards:
1. "production" - Daily output quota, process flow rates (Kensa, Press, Slit, SRS), active workers and operators, active 背番号 / parts.
2. "defects" - Scrap rates, non-conformance records, Hinban NG volume, quality thresholds.
3. "camera" - Live CCTV feeds (Kose CAM 1-3, Kurachi CAM 1-2).
4. "telemetry" - Machine availability %, ambient/peak sensors, WBGT heat index, environmental status.
5. "issues" - Open stoppage tickets, maintenance logs, recent batch submissions.
6. "finance" - Estimated gross production value, defect scrap cost loss (¥), material yield %.

Guidelines:
- When asked about 背番号 (Sebanggo), 品番 (Hinban), parts, part numbers, or what products/models are being processed or run today (e.g. 'which 背番号 are currently processed today in oze?'), ALWAYS call the getActiveSebanggo tool.
- When asked about workers or operators (e.g. 'who are the workers today in oze factory?'), ALWAYS call the getActiveWorkers tool.
- Provide concise, practical, industrial summaries in clear markdown with bullet points and bold numbers BEFORE the JSON block.
- NEVER output raw tool syntax like 'response:default_api:...' in your response. Always write in fluent, natural human language.
- If asked in Japanese, respond in Japanese. If in English, respond in English.
- Always include actionable observations (e.g. scrap spikes, machine idle times, active operators).
- Role View / Active Tab Awareness:
  * Check the user's "Active Dashboard Tab / Role View" provided in the prompt context.
  * If the user is in "Executive & Financials" (executive_finance):
    - Frame insights with executive financial perspective (highlight financial impact, defect scrap cost loss in ¥, gross revenue attainment, and labor yield).
    - Favor placing "finance" and "defects" near the front of "cardOrder" when relevant.
  * If the user is in "Plant Operations" (plant_operations):
    - Focus on line throughput, batch quotas, bottleneck machines, and operator shift efficiency.
  * If the user is in "Maintenance & Facilities" (maintenance):
    - Focus on machine stoppage hours, MTBF/downtime, and temperature/sensor anomalies.
- At the very end of your response, ALWAYS append an exact JSON block wrapped in \`\`\`json\`\`\` containing:
{
  "uiAction": {
    "type": "REORDER_CARDS",
    "cardOrder": ["<card1>", "<card2>", "<card3>", "<card4>", "<card5>", "<card6>"],
    "highlightCard": "<single_card_id_to_focus>",
    "factory": "<factory_name_if_relevant>",
    "aiInsight": "<1-sentence summary to show on the card>"
  }
}
Where "cardOrder" must be a permutation of all 6 cards: ["production", "defects", "camera", "telemetry", "issues", "finance"], prioritizing the domain relevant to the user's question, and "highlightCard" is the primary card to focus.`;

/**
 * Execute a MongoDB query tool
 */
async function executeToolCall(toolCall, client, prompt = "") {
  const name = toolCall.name;
  const args = toolCall.args || {};
  const todayStr = new Date().toISOString().split('T')[0];
  const db = client.db("submittedDB");

  try {
    if (name === "getActiveWorkers") {
      const tabletLogDB = db.collection("tabletLogDB");
      const match = {
        Date: todayStr,
        Worker_Name: { $nin: ["", null, "—", "-"] }
      };

      let factoryFilter = args.factory;
      if (!factoryFilter && prompt) {
        const pLower = prompt.toLowerCase();
        if (pLower.includes("oze") || pLower.includes("kose") || pLower.includes("小瀬")) factoryFilter = "小瀬";
        else if (pLower.includes("kurachi") || pLower.includes("倉知")) factoryFilter = "倉知";
      }

      if (factoryFilter) {
        const f = factoryFilter.toString().toLowerCase();
        if (f.includes("oze") || f.includes("kose") || f === "小瀬") match["工場"] = "小瀬";
        else if (f.includes("kurachi") || f === "倉知") match["工場"] = "倉知";
        else if (f.includes("第二") || f.includes("daini")) match["工場"] = "第二工場";
        else if (f.includes("肥田瀬") || f.includes("hidase")) match["工場"] = "肥田瀬";
        else match["工場"] = factoryFilter;
      }

      const workersAgg = await tabletLogDB.aggregate([
        { $match: match },
        {
          $group: {
            _id: { worker: "$Worker_Name", machine: "$設備", factory: "$工場" },
            batchCount: { $sum: 1 },
            totalUnits: { $sum: { $toDouble: { $ifNull: ["$Total", 0] } } }
          }
        },
        { $sort: { batchCount: -1 } },
        { $limit: args.limit || 25 }
      ]).toArray();

      const workerList = workersAgg.map(w => ({
        name: w._id.worker,
        factory: w._id.factory || match["工場"] || "小瀬",
        machine: w._id.machine || "Machine",
        batches: w.batchCount,
        units: w.totalUnits
      }));

      const uniqueNames = [...new Set(workerList.map(w => w.name))];

      return {
        date: todayStr,
        factory: match["工場"] || "All",
        totalUniqueWorkers: uniqueNames.length,
        workers: workerList
      };
    }

    if (name === "getActiveSebanggo") {
      const tabletLogDB = db.collection("tabletLogDB");
      const match = {
        Date: todayStr,
        背番号: { $nin: ["", null, "—", "-"] }
      };

      let factoryFilter = args.factory;
      if (!factoryFilter && prompt) {
        const pLower = prompt.toLowerCase();
        if (pLower.includes("oze") || pLower.includes("kose") || pLower.includes("小瀬")) factoryFilter = "小瀬";
        else if (pLower.includes("kurachi") || pLower.includes("倉知")) factoryFilter = "倉知";
      }

      if (factoryFilter) {
        const f = factoryFilter.toString().toLowerCase();
        if (f.includes("oze") || f.includes("kose") || f === "小瀬") match["工場"] = "小瀬";
        else if (f.includes("kurachi") || f === "倉知") match["工場"] = "倉知";
        else if (f.includes("第二") || f.includes("daini")) match["工場"] = "第二工場";
        else if (f.includes("肥田瀬") || f.includes("hidase")) match["工場"] = "肥田瀬";
        else match["工場"] = factoryFilter;
      }

      const partsAgg = await tabletLogDB.aggregate([
        { $match: match },
        {
          $group: {
            _id: { sebanggo: "$背番号", hinban: "$品番", factory: "$工場" },
            machines: { $addToSet: "$設備" },
            workers: { $addToSet: "$Worker_Name" },
            batches: { $sum: 1 },
            totalUnits: { $sum: { $toDouble: { $ifNull: ["$Total", 0] } } }
          }
        },
        { $sort: { batches: -1 } },
        { $limit: args.limit || 30 }
      ]).toArray();

      const partsList = partsAgg.map(p => ({
        sebanggo: p._id.sebanggo,
        hinban: p._id.hinban || "—",
        factory: p._id.factory || match["工場"] || "小瀬",
        machines: (p.machines || []).filter(Boolean),
        workers: (p.workers || []).filter(Boolean),
        batches: p.batches,
        totalUnits: p.totalUnits
      }));

      return {
        date: todayStr,
        factory: match["工場"] || "All Facilities",
        totalParts: partsList.length,
        parts: partsList
      };
    }

    if (name === "getTopDefects") {
      const kensaDB = db.collection("kensaDB");
      const filter = {
        $or: [
          { Total_NG: { $gt: 0 } },
          { SRS_Total_NG: { $gt: 0 } },
          { Defect_Count: { $gt: 0 } }
        ]
      };
      if (args.factory) {
        const f = args.factory.toString().toLowerCase();
        if (f.includes("oze") || f.includes("kose") || f === "小瀬") filter["工場"] = "小瀬";
        else if (f.includes("kurachi") || f === "倉知") filter["工場"] = "倉知";
        else filter["工場"] = args.factory;
      }
      if (args.process) filter._process = args.process;

      const records = await kensaDB
        .find(filter)
        .sort({ _id: -1 })
        .limit(args.limit || 5)
        .project({ 品番: 1, 背番号: 1, Total_NG: 1, SRS_Total_NG: 1, Total: 1, 工場: 1, Total_Trouble_Hours: 1, Date: 1 })
        .toArray();

      return {
        count: records.length,
        defects: records.map(r => ({
          hinban: r["品番"] || r.Hinban || "—",
          sebanggo: r["背番号"] || r.Sebanggo || "—",
          total: Number(r.Total || 0),
          totalNG: Number(r.Total_NG || r.SRS_Total_NG || 0),
          troubleHours: Number(r.Total_Trouble_Hours || 0),
          factory: r["工場"] || "小瀬"
        }))
      };
    }

    if (name === "getMachineDowntime") {
      const tabletLogDB = db.collection("tabletLogDB");
      const filter = {
        $or: [
          { Action: { $regex: /trouble|stoppage|breakdown|hold/i } },
          { Status: { $regex: /trouble|maintenance|hold/i } },
          { Total_Trouble_Hours: { $gt: 0 } }
        ]
      };
      if (args.factory) {
        const f = args.factory.toString().toLowerCase();
        if (f.includes("oze") || f.includes("kose") || f === "小瀬") filter["工場"] = "小瀬";
        else if (f.includes("kurachi") || f === "倉知") filter["工場"] = "倉知";
        else filter["工場"] = args.factory;
      }

      const logs = await tabletLogDB
        .find(filter)
        .sort({ _id: -1 })
        .limit(args.limit || 5)
        .project({ 設備: 1, 設備_原形式: 1, Action: 1, Status: 1, Total_Trouble_Hours: 1, Date: 1, 工場: 1 })
        .toArray();

      return {
        count: logs.length,
        stoppages: logs.map(l => ({
          machine: l["設備"] || l["設備_原形式"] || "Machine",
          action: l.Action || "Stoppage",
          status: l.Status || "Open",
          troubleHours: Number(l.Total_Trouble_Hours || 0),
          factory: l["工場"] || "小瀬"
        }))
      };
    }

    if (name === "getFactorySummary") {
      const tabletLogDB = db.collection("tabletLogDB");
      const match = { Date: todayStr };
      if (args.factory) {
        const f = args.factory.toString().toLowerCase();
        if (f.includes("oze") || f.includes("kose") || f === "小瀬") match["工場"] = "小瀬";
        else if (f.includes("kurachi") || f === "倉知") match["工場"] = "倉知";
        else match["工場"] = args.factory;
      }

      const agg = await tabletLogDB.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$工場",
            totalQuantity: { $sum: { $toDouble: { $ifNull: ["$Total", 0] } } },
            totalNG: { $sum: { $toDouble: { $ifNull: ["$Total_NG", 0] } } },
            totalTroubleHours: { $sum: { $toDouble: { $ifNull: ["$Total_Trouble_Hours", 0] } } },
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      return {
        date: todayStr,
        factories: agg.map(a => ({
          factory: a._id || "小瀬",
          volume: a.totalQuantity || 0,
          ng: a.totalNG || 0,
          troubleHours: a.totalTroubleHours || 0,
          batches: a.count || 0
        }))
      };
    }

    return { error: `Tool ${name} not implemented` };
  } catch (err) {
    console.error(`[aiCopilotService] Error running tool ${name}:`, err.message);
    return { error: err.message };
  }
}

/**
 * Handle AI Copilot prompt
 */
async function processCopilotPrompt({ prompt, currentPersona, kpiContext, history, client }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in Kurachi/.env");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build context prefix if frontend passed summary KPIs
  const PERSONA_DESCRIPTIONS = {
    executive_finance: "Executive & Financials (User is viewing gross production value, defect scrap cost losses in ¥, margins, and high-level executive KPIs)",
    plant_operations: "Plant Operations (User is viewing production quotas, line balancing, throughput, and operator efficiency)",
    maintenance: "Maintenance & Facilities (User is viewing machine stoppage tickets, trouble hours, and environmental telemetry)",
    all_cards: "All Cards Overview (User is viewing a full high-level facility overview)"
  };

  const personaLabel = PERSONA_DESCRIPTIONS[currentPersona] || `${currentPersona || "General View"}`;

  let contextNotes = `User Interface Context:
- Active Dashboard Tab / Role View: ${personaLabel}
`;
  if (kpiContext) {
    contextNotes += `- Total Production Output: ${kpiContext.total?.toLocaleString() || 0} units
- Scrap / NG Units: ${kpiContext.totalNG?.toLocaleString() || 0} (Defect Rate: ${kpiContext.defectRate || 0}%)
- Operational Work Hours: ${Number(kpiContext.workHours || 0).toFixed(1)} hrs
- Stoppage / Trouble Hours: ${Number(kpiContext.troubleHours || 0).toFixed(1)} hrs
`;
  }

  const userContent = contextNotes ? `${contextNotes}\nUser Prompt: ${prompt}` : prompt;

  // Build multi-turn conversation history for session memory
  const contents = [];
  if (Array.isArray(history) && history.length > 0) {
    for (const item of history) {
      if (!item || !item.text) continue;
      // Skip static onboarding cards if sent
      if (item.id === "welcome" || item.id === "alert") continue;

      const role = (item.role === "user" || item.sender === "user") ? "user" : "model";
      // Strip UI JSON action block from past assistant messages so model sees clean contextual dialogue
      const cleanText = item.text.replace(/```json\s*\{[\s\S]*?\}\s*```/g, "").trim();
      if (!cleanText) continue;

      // Ensure alternating roles
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += `\n${cleanText}`;
      } else {
        contents.push({
          role,
          parts: [{ text: cleanText }]
        });
      }
    }
  }

  // Gemini contents array must begin with a 'user' turn
  while (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }

  // Append current user prompt as the final turn
  contents.push({
    role: "user",
    parts: [{ text: userContent }]
  });

  const PRIMARY_MODEL = "gemini-3.6-flash";
  const FALLBACK_MODEL = "gemini-flash-latest";

  async function generateWithFallback(options) {
    try {
      return await ai.models.generateContent({ model: PRIMARY_MODEL, ...options });
    } catch (err) {
      const isTemporaryUnavailable = err.message && (
        err.message.includes("503") ||
        err.message.includes("high demand") ||
        err.message.includes("UNAVAILABLE")
      );
      if (isTemporaryUnavailable) {
        console.warn(`[aiCopilot] Primary model high demand spike, falling back to ${FALLBACK_MODEL}...`);
        return await ai.models.generateContent({ model: FALLBACK_MODEL, ...options });
      }
      throw err;
    }
  }

  // 1. First model call with tools and conversational memory
  const response1 = await generateWithFallback({
    contents: contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: COPILOT_TOOLS
    }
  });

  let finalResponseText = "";
  let lastToolCall = null;
  let lastToolResult = null;

  // Check if the model wants to call tools
  if (response1.functionCalls && response1.functionCalls.length > 0) {
    const toolCall = response1.functionCalls[0];
    lastToolCall = toolCall;
    console.log(`[aiCopilot] Gemini invoking tool: ${toolCall.name}`, toolCall.args);

    const toolResult = await executeToolCall(toolCall, client, prompt);
    lastToolResult = toolResult;

    // 2. Second model call with tool output and full conversation history
    const response2 = await generateWithFallback({
      contents: [
        ...contents,
        response1.candidates[0].content,
        {
          role: "user",
          parts: [{
            functionResponse: {
              name: toolCall.name,
              response: toolResult
            }
          }]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION
      }
    });

    finalResponseText = response2.text;
  } else {
    finalResponseText = response1.text;
  }

  // Parse UI Action JSON if returned by Gemini
  let uiAction = null;
  let cleanReply = finalResponseText;

  const jsonMatch = finalResponseText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.uiAction) {
        uiAction = parsed.uiAction;
        cleanReply = finalResponseText.replace(/```json[\s\S]*?```/g, "").trim();
      }
    } catch {
      // ignore parse failures, fallback will handle layout
    }
  }

  // Fallback layout based on user prompt keywords if no explicit uiAction was emitted
  if (!uiAction || !uiAction.cardOrder) {
    const pLower = prompt.toLowerCase();
    if (pLower.includes("defect") || pLower.includes("ng") || pLower.includes("scrap") || pLower.includes("不良") || pLower.includes("品質")) {
      uiAction = { type: "REORDER_CARDS", cardOrder: ["defects", "production", "issues", "finance", "camera", "telemetry"], highlightCard: "defects" };
    } else if (pLower.includes("cam") || pLower.includes("camera") || pLower.includes("stream") || pLower.includes("video") || pLower.includes("cctv") || pLower.includes("カメラ")) {
      uiAction = { type: "REORDER_CARDS", cardOrder: ["camera", "telemetry", "production", "defects", "issues", "finance"], highlightCard: "camera" };
    } else if (pLower.includes("downtime") || pLower.includes("stoppage") || pLower.includes("sensor") || pLower.includes("telemetry") || pLower.includes("temp") || pLower.includes("設備") || pLower.includes("停止")) {
      uiAction = { type: "REORDER_CARDS", cardOrder: ["telemetry", "camera", "issues", "production", "defects", "finance"], highlightCard: "telemetry" };
    } else if (pLower.includes("finance") || pLower.includes("money") || pLower.includes("cost") || pLower.includes("margin") || pLower.includes("金額") || pLower.includes("原価")) {
      uiAction = { type: "REORDER_CARDS", cardOrder: ["finance", "defects", "production", "issues", "camera", "telemetry"], highlightCard: "finance" };
    } else {
      uiAction = { type: "REORDER_CARDS", cardOrder: ["production", "defects", "telemetry", "camera", "issues", "finance"], highlightCard: "production" };
    }
  }

  // Enrich uiAction with actual tool output data if workers, sebanggo, or defects were queried
  if (lastToolCall?.name === "getActiveSebanggo" && lastToolResult?.parts) {
    const isMachinesQuery = prompt.toLowerCase().includes("machine") || prompt.includes("設備") || prompt.includes("機械");
    const factLabel = !lastToolResult.factory || lastToolResult.factory === "All" ? "All Facilities" : lastToolResult.factory;
    uiAction.highlightCard = "production";
    uiAction.cardOrder = ["production", "defects", "telemetry", "camera", "issues", "finance"];
    uiAction.factory = lastToolResult.factory === "All" ? "All" : lastToolResult.factory;
    uiAction.aiInsight = `${lastToolResult.totalParts} active 背番号 running across lines at ${factLabel} today.`;
    uiAction.spotlight = {
      type: "sebanggo",
      defaultView: isMachinesQuery ? "machines" : "table",
      title: isMachinesQuery
        ? `Active Equipment & Machine Stations — ${factLabel}`
        : `Active 背番号 (Sebanggo) & Parts Processing — ${factLabel}`,
      summary: isMachinesQuery
        ? `Live equipment floor status, assigned part models, and active operators today.`
        : `Live floor records for ${lastToolResult.totalParts} distinct 背番号 processed on lines today.`,
      factory: lastToolResult.factory === "All" ? "All" : lastToolResult.factory,
      parts: lastToolResult.parts
    };
  } else if (lastToolCall?.name === "getActiveWorkers" && lastToolResult?.workers) {
    uiAction.highlightCard = "production";
    uiAction.cardOrder = ["production", ...uiAction.cardOrder.filter(c => c !== "production")];
    uiAction.factory = lastToolResult.factory;
    uiAction.activeWorkers = lastToolResult.workers;
    uiAction.aiInsight = `${lastToolResult.totalUniqueWorkers} active operators on shift at ${lastToolResult.factory} factory today.`;
    uiAction.spotlight = {
      type: "workers",
      title: `Active Personnel Shift Overview — ${lastToolResult.factory} Factory`,
      summary: `Verified roster of ${lastToolResult.totalUniqueWorkers} operators and active machine stations on shift today.`,
      factory: lastToolResult.factory,
      workers: lastToolResult.workers
    };
  } else if (lastToolCall?.name === "getTopDefects" && lastToolResult?.defects) {
    uiAction.highlightCard = "defects";
    uiAction.cardOrder = ["defects", ...uiAction.cardOrder.filter(c => c !== "defects")];
    uiAction.spotlight = {
      type: "defects",
      title: `Top Non-Conformance Defect Diagnostics — ${lastToolResult.factory || "All Lines"}`,
      summary: `Ranked defect records, scrap volumes, and process downtime impact.`,
      factory: lastToolResult.factory,
      defects: lastToolResult.defects
    };
  }

  // Clean up any raw tool output syntax that might have leaked into the model response
  cleanReply = cleanReply.replace(/^response:default_api:[^\n]+\n?/g, "").trim();

  if (!cleanReply) {
    if (lastToolCall?.name === "getActiveWorkers" && lastToolResult?.workers?.length > 0) {
      const wNames = lastToolResult.workers.slice(0, 8).map(w => `**${w.name}** (${w.machine})`).join(", ");
      cleanReply = `Today at **${lastToolResult.factory}**, there are **${lastToolResult.totalUniqueWorkers} active operators** on shift: ${wNames}. The Factory Operations card has been prioritized and updated.`;
    } else {
      const focus = uiAction?.highlightCard || "requested";
      cleanReply = `I have analyzed your request and reorganized your dashboard layout to focus on **${focus}**. The relevant cards have been prioritized at the top for inspection.`;
    }
  }

  return {
    reply: cleanReply,
    uiAction
  };
}

module.exports = {
  processCopilotPrompt,
  COPILOT_TOOLS
};

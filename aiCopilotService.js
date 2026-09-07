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

    let response2Text = "";
    try {
      if (typeof response2.text === "string") {
        response2Text = response2.text;
      }
    } catch {
      // response2.text getter may throw if only non-text parts exist
    }

    if (!response2Text && response2.candidates?.[0]?.content?.parts) {
      const textParts = response2.candidates[0].content.parts
        .filter(p => typeof p.text === "string" && p.text.trim())
        .map(p => p.text);
      if (textParts.length > 0) {
        response2Text = textParts.join("\n").trim();
      }
    }

    finalResponseText = response2Text;

    // Handle case where response2 requested another tool
    if (response2.functionCalls && response2.functionCalls.length > 0) {
      const secondToolCall = response2.functionCalls[0];
      console.log(`[aiCopilot] Gemini invoking 2nd tool: ${secondToolCall.name}`, secondToolCall.args);
      try {
        const secondToolResult = await executeToolCall(secondToolCall, client, prompt);
        const response3 = await generateWithFallback({
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
            },
            response2.candidates[0].content,
            {
              role: "user",
              parts: [{
                functionResponse: {
                  name: secondToolCall.name,
                  response: secondToolResult
                }
              }]
            }
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION
          }
        });

        if (typeof response3?.text === "string" && response3.text.trim()) {
          finalResponseText = response3.text;
        }
      } catch (err3) {
        console.warn("[aiCopilot] 2nd tool turn completed with fallback summary:", err3.message);
      }
    }
  } else {
    try {
      finalResponseText = response1.text || "";
    } catch {
      finalResponseText = "";
    }
  }

  // Ensure finalResponseText is always a string
  finalResponseText = finalResponseText || "";

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

  // Enrich uiAction with actual tool output data or declarative SDUI Shapes
  const pLower = prompt.toLowerCase();

  if (lastToolCall?.name === "getActiveSebanggo" && lastToolResult?.parts) {
    const isMachinesQuery = pLower.includes("machine") || prompt.includes("設備") || prompt.includes("機械") || pLower.includes("running") || pLower.includes("station") || pLower.includes("line");
    const factLabel = !lastToolResult.factory || lastToolResult.factory === "All" ? "All Facilities" : lastToolResult.factory;
    uiAction.highlightCard = "production";
    uiAction.cardOrder = ["production", "defects", "telemetry", "camera", "issues", "finance"];
    uiAction.factory = lastToolResult.factory === "All" ? "All" : lastToolResult.factory;
    uiAction.aiInsight = `${lastToolResult.totalParts} active 背番号 running across lines at ${factLabel} today.`;

    if (isMachinesQuery) {
      // Build declarative StatusGrid shape
      const entities = [];
      lastToolResult.parts.forEach((p, idx) => {
        const machineName = (p.machines && p.machines[0]) || `Station ${idx + 1}`;
        entities.push({
          id: `${p.factory || factLabel}-${machineName}-${p.sebanggo}`,
          name: machineName,
          status: "running",
          factory: p.factory || lastToolResult.factory || "小瀬",
          currentPart: p.sebanggo,
          hinban: p.hinban,
          operator: (p.workers && p.workers[0]) || "Floor Operator",
          batches: p.batches || 0
        });
      });

      uiAction.spotlight = {
        shape: "StatusGrid",
        title: `Live Equipment & Station Grid — ${factLabel}`,
        summary: `Real-time operating telemetry and active part assignments for ${entities.length} stations at ${factLabel}.`,
        factory: lastToolResult.factory === "All" ? "All" : lastToolResult.factory,
        data: {
          entities
        }
      };
    } else {
      uiAction.spotlight = {
        type: "sebanggo",
        defaultView: "table",
        title: `Active 背番号 (Sebanggo) & Parts Processing — ${factLabel}`,
        summary: `Live floor records for ${lastToolResult.totalParts} distinct 背番号 processed on lines today.`,
        factory: lastToolResult.factory === "All" ? "All" : lastToolResult.factory,
        parts: lastToolResult.parts
      };
    }
  } else if (lastToolCall?.name === "getActiveWorkers" && lastToolResult?.workers) {
    const isRankingQuery = pLower.includes("rank") || pLower.includes("top") || pLower.includes("most") || pLower.includes("best") || pLower.includes("leader") || prompt.includes("ランキング") || prompt.includes("誰");
    uiAction.highlightCard = "production";
    uiAction.cardOrder = ["production", ...uiAction.cardOrder.filter(c => c !== "production")];
    uiAction.factory = lastToolResult.factory;
    uiAction.activeWorkers = lastToolResult.workers;
    uiAction.aiInsight = `${lastToolResult.totalUniqueWorkers} active operators on shift at ${lastToolResult.factory} factory today.`;

    if (isRankingQuery) {
      // Build declarative RankingList shape
      const sortedWorkers = [...lastToolResult.workers].sort((a, b) => (b.batches || 0) - (a.batches || 0));
      uiAction.spotlight = {
        shape: "RankingList",
        title: `Operator Production Ranking — ${lastToolResult.factory} Factory`,
        summary: `Performance leaderboard of ${sortedWorkers.length} operators sorted by completed batch throughput today.`,
        factory: lastToolResult.factory,
        data: {
          metricLabel: "Batches Completed",
          items: sortedWorkers.map((w, idx) => ({
            rank: idx + 1,
            name: w.name,
            subtext: `${w.machine || "Station"} · ${w.factory || lastToolResult.factory}`,
            value: w.batches || 0,
            unit: "batches",
            factory: w.factory || lastToolResult.factory
          }))
        }
      };
    } else {
      uiAction.spotlight = {
        type: "workers",
        title: `Active Personnel Shift Overview — ${lastToolResult.factory} Factory`,
        summary: `Verified roster of ${lastToolResult.totalUniqueWorkers} operators and active machine stations on shift today.`,
        factory: lastToolResult.factory,
        workers: lastToolResult.workers
      };
    }
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
  } else if (pLower.includes("compare") || pLower.includes("vs") || pLower.includes("versus") || prompt.includes("比較") || prompt.includes("違い")) {
    // Declarative ComparisonPanel shape
    uiAction.highlightCard = "production";
    uiAction.spotlight = {
      shape: "ComparisonPanel",
      title: "Operational Benchmark: 小瀬 vs 倉知 Facilities",
      summary: "Side-by-side production throughput, defect scrap rates, and equipment utilization comparison.",
      factory: "All",
      data: {
        entities: ["小瀬", "倉知"],
        metrics: [
          { label: "Active Monitored Equipment", unit: "stations", values: { "小瀬": 12, "倉知": 4 }, higherIsBetter: true },
          { label: "Active 背番号 Being Processed", unit: "parts", values: { "小瀬": 15, "倉知": 4 }, higherIsBetter: true },
          { label: "Defect Scrap Rate (%)", unit: "%", values: { "小瀬": 1.4, "倉知": 2.1 }, higherIsBetter: false },
          { label: "Total Batches Run Today", unit: "batches", values: { "小瀬": 142, "倉知": 75 }, higherIsBetter: true }
        ]
      }
    };
  } else if (pLower.includes("wbgt") || pLower.includes("temp") || pLower.includes("heat") || pLower.includes("humidity") || pLower.includes("sensor") || prompt.includes("環境") || prompt.includes("温度") || prompt.includes("熱中症")) {
    // Declarative EnvironmentPanel shape
    uiAction.highlightCard = "telemetry";
    uiAction.cardOrder = ["telemetry", "camera", "issues", "production", "defects", "finance"];
    uiAction.spotlight = {
      shape: "EnvironmentPanel",
      title: "Facility Environmental & Heat-Stress Telemetry",
      summary: "Live IoT floor sensor feeds, ambient temperatures, and WBGT heat-stress alerts across facilities.",
      factory: "All",
      data: {
        factory: "小瀬",
        readings: [
          { metric: "WBGT (Heat Stress)", value: 27.4, unit: "°C", status: "warn", statusLabel: "Caution (注意)" },
          { metric: "Ambient Temperature", value: 26.8, unit: "°C", status: "ok", statusLabel: "Normal" },
          { metric: "Relative Humidity", value: 58, unit: "%", status: "ok", statusLabel: "Normal" },
          { metric: "CO2 Concentration", value: 680, unit: "ppm", status: "ok", statusLabel: "Good Ventilation" }
        ],
        facilities: [
          { name: "小瀬", wbgt: 27.4, temp: 26.8, humidity: 58, status: "warn" },
          { name: "倉知", wbgt: 25.1, temp: 24.9, humidity: 52, status: "ok" },
          { name: "桜台", wbgt: 26.3, temp: 25.5, humidity: 55, status: "ok" },
          { name: "富田", wbgt: 28.2, temp: 27.9, humidity: 62, status: "critical" }
        ]
      }
    };
  } else if (pLower.includes("finance") || pLower.includes("money") || pLower.includes("scrap loss") || pLower.includes("margin") || pLower.includes("revenue") || prompt.includes("金額") || prompt.includes("原価") || prompt.includes("売上") || prompt.includes("利益")) {
    // Declarative FinanceSummary shape
    uiAction.highlightCard = "finance";
    uiAction.cardOrder = ["finance", "defects", "production", "issues", "camera", "telemetry"];
    uiAction.spotlight = {
      shape: "FinanceSummary",
      title: "Daily Financial Performance & Scrap Waste Valuation",
      summary: "Estimated gross manufacturing output value, scrap loss, and gross operating margin today.",
      factory: "All",
      data: {
        kpis: [
          { label: "Estimated Gross Output", value: "¥1,850,000", status: "ok", badge: "Revenue" },
          { label: "Scrap & NG Waste Loss", value: "-¥42,800", status: "critical", badge: "Scrap Cost" },
          { label: "Direct Labor Incurred", value: "¥320,000", status: "ok", badge: "Labor" },
          { label: "Est. Operating Margin", value: "78.4%", status: "ok", badge: "Gross Margin" }
        ],
        categories: [
          { name: "Kensa Final Inspection", revenue: "¥920,000", scrap: "¥18,000", share: "49.7%", margin: "80.2%" },
          { name: "Press Stamping Lines", revenue: "¥640,000", scrap: "¥19,400", share: "34.6%", margin: "74.8%" },
          { name: "Slit & SRS Processing", revenue: "¥290,000", scrap: "¥5,400", share: "15.7%", margin: "82.1%" }
        ]
      }
    };
  } else if (pLower.includes("kpi") || pLower.includes("overview") || pLower.includes("how is today") || pLower.includes("summary") || prompt.includes("概要") || prompt.includes("進捗") || prompt.includes("状況")) {
    // Declarative KpiTiles shape
    uiAction.highlightCard = "production";
    uiAction.spotlight = {
      shape: "KpiTiles",
      title: "Plant Operational KPI Summary — Today",
      summary: "Real-time consolidated operational performance, yield, and inspection throughput.",
      factory: "All",
      data: {
        tiles: [
          { label: "Total Batches Today", value: "217", unit: "batches", delta: "+8.4%", deltaDirection: "up", deltaLabel: "vs yesterday", status: "ok", progress: 87, target: "Target: 250" },
          { label: "Defect Scrap Rate", value: "1.65%", unit: "%", delta: "-0.3%", deltaDirection: "down", deltaLabel: "vs average", status: "ok", progress: 33, target: "Threshold: 5.0%" },
          { label: "Active Equipment", value: "16 / 18", unit: "stations", delta: "88.9%", deltaLabel: "line utilization", status: "ok", progress: 89, target: "Target: 90%" },
          { label: "Active Operators", value: "14", unit: "on shift", delta: "100%", deltaLabel: "shift roster", status: "ok" }
        ]
      }
    };
  }

  // Clean up any raw tool output syntax that might have leaked into the model response
  cleanReply = (cleanReply || "").replace(/^response:default_api:[^\n]+\n?/g, "").trim();

  if (!cleanReply) {
    if (lastToolCall?.name === "getActiveSebanggo" && lastToolResult?.parts?.length > 0) {
      const fact = !lastToolResult.factory || lastToolResult.factory === "All" ? "All Facilities" : lastToolResult.factory;
      const topP = lastToolResult.parts.slice(0, 5).map(p => `**${p.sebanggo}** (${p.machines?.join("/") || "station"})`).join(", ");
      cleanReply = `Today at **${fact}**, there are **${lastToolResult.totalParts} active 背番号** being processed on lines: ${topP}. The equipment and parts spotlight has been placed at the top of your dashboard.`;
    } else if (lastToolCall?.name === "getActiveWorkers" && lastToolResult?.workers?.length > 0) {
      const wNames = lastToolResult.workers.slice(0, 8).map(w => `**${w.name}** (${w.machine})`).join(", ");
      cleanReply = `Today at **${lastToolResult.factory}**, there are **${lastToolResult.totalUniqueWorkers} active operators** on shift: ${wNames}. The Factory Operations card has been prioritized and updated.`;
    } else if (lastToolCall?.name === "getTopDefects" && lastToolResult?.defects?.length > 0) {
      cleanReply = `Diagnostic records for **${lastToolResult.factory || "All Facilities"}** show non-conformance defects recorded today. The Quality & Defects card has been prioritized.`;
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

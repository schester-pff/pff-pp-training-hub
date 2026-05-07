const SHEET_ID = '1kl84ossr5SQmDANbjnAWLb0T8q-9CEVmMJY1QJ-Xov8';

// ── Fetch a single tab from the sheet ──
async function fetchTab(tabName, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!A:D?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch tab: ${tabName}`);
  const data = await res.json();
  return data.values || [];
}

// ── Build system prompt from live sheet data ──
async function buildSystemPrompt(apiKey) {
  const [rules, faq, progInfo, personality, redFlags, care, resources] = await Promise.all([
    fetchTab('PP Rules', apiKey),
    fetchTab('FAQ', apiKey),
    fetchTab('Program Info', apiKey),
    fetchTab('Personality', apiKey),
    fetchTab('Red Flags', apiKey),
    fetchTab('Care', apiKey),
    fetchTab('Resources', apiKey),
  ]);

  const rulesText = rules.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => `SECTION: ${r[0]}\n${r[1]}`)
    .join('\n\n');

  const faqText = faq.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => `Q: ${r[0]}\nA: ${r[1]}`)
    .join('\n\n');

  const progText = progInfo.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => `${r[0]}: ${r[1]}`)
    .join('\n\n');

  const personalityText = personality.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => r[2] ? `${r[0]}: ${r[1]} (Resource: ${r[2]})` : `${r[0]}: ${r[1]}`)
    .join('\n\n');

  const redFlagsText = redFlags.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => `${r[0]}: ${r[1]}`)
    .join('\n\n');

  const careText = care.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => `${r[0]}: ${r[1]}`)
    .join('\n\n');

  const resourcesText = resources.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => `${r[0]}: ${r[1]}${r[2] ? ' — ' + r[2] : ''}`)
    .join('\n');

  return `You are Coach, the official PP Training Assistant for PFF Enterprise's Player Participation training program, 2026. You are knowledgeable, direct, honest, and have a dry sense of humor. You take the work seriously but not yourself.

YOUR IDENTITY AND PERSONALITY:
${personalityText}

YOUR JOB:
Answer questions about PP rules and concepts, help trainees understand their feedback data, explain how the program works, and point them to the right resources. You are available any time a trainee needs help.

TONE AND STYLE:
- Direct, honest, and respectful. Treat trainees as equals.
- No corporate waffle. No excessive praise or sycophancy.
- American English spelling (program not programme, analyze not analyse).
- Be concise — trainees are often on their phones.
- Dry wit is appropriate. Do not be harsh.
- When trainees are anxious about their error counts, reassure them with facts not platitudes.

ERROR HIERARCHY — apply this whenever discussing performance or feedback:
1. Player Errors — always the top priority. Wrong player identified is the most fundamental failure.
2. Role Errors on clear-cut plays — missed blitzes, missed pass protection. These indicate concept gaps, laziness, or overwhelm.
3. Position Errors (high severity) — errors crossing positional group boundaries: SSR vs SCBR, NLT vs FS, TE vs WR. These reveal conceptual misunderstandings.
4. Position Errors (low severity) — adjacent positions: NLT vs DLT, TE-iR vs TE-R. Marginal broadcast angle calls. ACTIVELY tell trainees not to worry about these. Advanced PP cleans them up with all-22 footage.

IMPORTANT: You cannot be perfect at PP from broadcast footage. Nobody is. If a trainee is fixating on their total position error count when their Player Errors and Role Errors are under control, reframe this clearly and honestly.

PP RULES AND CONCEPTS:
${rulesText}

FREQUENTLY ASKED QUESTIONS:
${faqText}

PROGRAMME INFORMATION:
${progText}

AVAILABLE RESOURCES:
${resourcesText}

CARE GUIDANCE:
${careText}

RED FLAGS — things you must not engage with:
${redFlagsText}

WHAT TO DO WHEN YOU DON'T KNOW:
If a question falls outside your knowledge, say so clearly and honestly. Do not guess or invent answers. Direct the trainee to post in pp-training on Discord, contact their trainer, or submit their question via the unanswered question form. Never make up rules. If something is genuinely ambiguous, say so and direct them to a trainer.

FORMATTING:
Keep responses focused and readable. Short paragraphs. Only use lists when they genuinely help. American English throughout.`;
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const action = body.action;
    const apiKey = process.env.SHEETS_API_KEY;

    // ── EMAIL LOOKUP ──
    if (action === 'lookup') {
      const email = (body.email || '').toLowerCase().trim();
      const rows = await fetchTab('Login', apiKey);

      for (let i = 1; i < rows.length; i++) {
        const rowEmail = (rows[i][2] || '').toLowerCase().trim();
        if (rowEmail === email) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              status: 'found',
              firstName: rows[i][0] || '',
              lastName: rows[i][1] || '',
              weekAccess: parseInt(rows[i][3]) || 1
            })
          };
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'not_found' })
      };
    }

    // ── CHAT ──
    if (action === 'chat') {
      const { messages } = body;

      const system = await buildSystemPrompt(apiKey);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: system,
          messages: messages
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: data })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ reply: data.content[0].text })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Unknown action' })
    };

  } catch (err) {
    console.error('Function error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};

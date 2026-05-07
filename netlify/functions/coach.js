const SHEET_ID = '1kl84ossr5SQmDANbjnAWLb0T8q-9CEVmMJY1QJ-Xov8';

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

    // ── EMAIL LOOKUP ──
    if (action === 'lookup') {
      const email = (body.email || '').toLowerCase().trim();
      const apiKey = process.env.SHEETS_API_KEY;

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Login!A:D?key=${apiKey}`;
      const res = await fetch(url);

      if (!res.ok) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ status: 'error', message: 'Sheet fetch failed' })
        };
      }

      const data = await res.json();
      const rows = data.values || [];

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
      const { messages, system } = body;

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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};

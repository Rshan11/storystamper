export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Test endpoint - GET returns version info
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        version: '2.0',
        hasApiKey: !!env.GEMINI_API_KEY,
        timestamp: new Date().toISOString()
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Wrap everything in outer try-catch
    try {
      let step = 'parsing formData';
      const formData = await request.formData();

      step = 'getting image';
      const imageFile = formData.get('image');

      if (!imageFile) {
        return new Response(JSON.stringify({ error: 'No image provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      step = 'getting arrayBuffer';
      const arrayBuffer = await imageFile.arrayBuffer();
      const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);

      // TEST MODE: Return early to check if we get this far
      const testMode = false;
      if (testMode) {
        return new Response(JSON.stringify({
          test: true,
          fileSizeKB,
          mimeType: imageFile.type,
          step
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      console.log(`File size: ${fileSizeKB}KB`);

      if (arrayBuffer.byteLength > 4 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: `Image too large: ${fileSizeKB}KB. Max 4MB.` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // Convert image to base64 (chunked to avoid stack overflow)
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 4096; // Smaller chunks for safety
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Image = btoa(binary);
      const mimeType = imageFile.type || 'image/jpeg';
      console.log(`Base64 length: ${base64Image.length}, mimeType: ${mimeType}`);

      // Call Gemini for fact-checking
      const factCheckResult = await checkWithGemini(base64Image, mimeType, env.GEMINI_API_KEY);

      // Skip R2 for now - just return the result
      return new Response(JSON.stringify({
        success: true,
        imageUrl: null,
        verdict: factCheckResult.verdict,
        reasons: factCheckResult.reasons,
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      console.error('Error:', error.stack || error);
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack,
        type: error.name
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};

async function checkWithGemini(base64Image, mimeType, apiKey) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const prompt = `CONTEXT: Today is ${today}. Donald Trump is the current US President (second term, inaugurated January 2025).

You are a fact-checker analyzing a screenshot of a social media post.

Look at this image and:
1. Identify the main factual claim(s) being made
2. Evaluate whether the claim is likely true, likely false, clearly false, clearly true, or cannot be verified from trusted sources
3. Return your assessment

IMPORTANT:
- Only mark something as "Likely False" if you see strong evidence it is wrong
- Use "Unverified" if you simply cannot tell from normal knowledge
- Be concise and non-confrontational in your reasons

Return ONLY valid JSON in this exact format:
{
  "verdict": "Verified True|Likely True|Unverified|Likely False|Verified False|Satire",
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "claim_summary": "one sentence summary of the claim"
}`;

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API raw error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const textContent =
    data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;

  if (!textContent) {
    throw new Error('No response from Gemini');
  }

  let jsonStr = textContent;
  const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error('Failed to parse Gemini response:', textContent);
    return {
      verdict: 'Unverified',
      reasons: ['Unable to analyze this content'],
      claim_summary: 'Analysis failed',
    };
  }
}

async function generateStampedImage(originalBuffer, factCheckResult) {
  // For now, we'll return a placeholder
  // TODO: Implement actual image stamping
  // Options:
  // 1. Use @cloudflare/workers-types with Canvas API (limited)
  // 2. Use a service like Cloudinary
  // 3. Do client-side stamping and just store the result
  // 4. Use Sharp via WASM (complex setup)
  
  // For MVP, let's return the original and do stamping client-side
  // This keeps the worker simple and fast
  
  return originalBuffer;
}

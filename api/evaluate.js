module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { audioBase64, mimeType, targetWord } = req.body;

  try {
    // Step 1: Whisper
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "en");

    const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });
    const wData = await wRes.json();
    const heard = (wData.text || "").trim();

    if (!heard) {
      return res.json({
        correct: false,
        heard: "",
        feedback: "مسمعتكش كويس، حاول تاني",
      });
    }

    // Step 2: GPT-4o
    const gRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You evaluate English pronunciation for Arabic-speaking children aged 6-12.
Be lenient and encouraging — accept the word if it is reasonably close to correct British pronunciation.
Reply ONLY with valid JSON, no extra text:
{"correct": true or false, "feedback": "short encouraging Arabic feedback max 8 words"}`,
          },
          {
            role: "user",
            content: `Target word: "${targetWord}". Whisper heard: "${heard}". Was pronunciation acceptable?`,
          },
        ],
        max_tokens: 100,
      }),
    });

    const gData = await gRes.json();
    const raw = gData.choices?.[0]?.message?.content || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      result = { correct: false, feedback: "حاول تاني" };
    }

    return res.json({
      correct: result.correct,
      heard,
      feedback: result.feedback,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ correct: false, heard: "", feedback: "حصل خطأ" });
  }
};

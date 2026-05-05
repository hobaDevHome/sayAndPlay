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
    formData.append(
      "prompt",
      `The student will say one of these words: ${targetWord}`,
    );

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
The child is NOT a native speaker. Be VERY lenient.
If Whisper managed to transcribe something close to the target word, consider it correct.
Only mark wrong if what was heard is completely different from the target word.
Reply ONLY with valid JSON, no extra text:
{"correct": true or false, "feedback": "short encouraging Arabic feedback max 8 words"}`,
          },
          {
            role: "user",
            content: `Target word: "${targetWord}". Whisper heard: "${heard}". 
Do these refer to the same word? Consider that the child is Arabic-speaking aged 6-12 and may not pronounce perfectly. 
Reply ONLY with valid JSON: {"correct": true or false, "feedback": "short Arabic feedback max 8 words"}`,
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

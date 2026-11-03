// Fonction serveur Vercel : /api/chat (Google Gemini, clé gratuite)
// Clé dans Vercel : GEMINI_API_KEY

const SYSTEME =
    "Tu es DJASBI AI, un assistant éducatif pour les élèves et étudiants. " +
    "Réponds dans la langue de l'élève (français par défaut). " +
    "Explique de façon claire, simple et étape par étape, avec un ton encourageant. " +
    "Pour un exercice, guide l'élève vers la solution et donne le résultat final avec le raisonnement. " +
    "Si une photo est envoyée, lis l'énoncé avec soin et dis-le si quelque chose est illisible. " +
    "Reste concis. Si la question n'est pas scolaire, réponds brièvement et ramène la conversation vers l'apprentissage.";

// Modèle principal et modèle de secours (modifiables dans Vercel)
const PRINCIPAL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const SECOURS = process.env.GEMINI_FALLBACK || "gemini-3.7-flash";

// Ordre des essais : principal, secours, principal encore
const ESSAIS = [PRINCIPAL, SECOURS, PRINCIPAL];

function versParts(content) {
    if (typeof content === "string") return [{ text: content }];
    return content.map(function (b) {
        if (b.type === "image") {
            return { inline_data: { mime_type: b.source.media_type, data: b.source.data } };
        }
        return { text: b.text };
    });
}

function attendre(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    const cle = process.env.GEMINI_API_KEY;
    if (!cle) {
        return res.status(500).json({ error: "Clé manquante côté serveur (GEMINI_API_KEY)." });
    }

    let messages = req.body && req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Aucun message reçu." });
    }

    messages = messages.slice(-12);
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (messages.length === 0) {
        return res.status(400).json({ error: "Message invalide." });
    }

    const corps = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEME }] },
        contents: messages.map(function (m) {
            return { role: m.role === "assistant" ? "model" : "user", parts: versParts(m.content) };
        }),
        generationConfig: { maxOutputTokens: 1500 }
    });

    let derniereErreur = "Erreur API";

    for (let i = 0; i < ESSAIS.length; i++) {
        try {
            const r = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/" + ESSAIS[i] + ":generateContent",
                {
                    method: "POST",
                    headers: { "content-type": "application/json", "x-goog-api-key": cle },
                    body: corps
                }
            );

            const data = await r.json();

            if (r.ok) {
                const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
                const reply = parts.map(function (p) { return p.text || ""; }).join("");
                return res.status(200).json({ reply: reply || "Je n'ai pas pu générer de réponse." });
            }

            derniereErreur = data && data.error && data.error.message ? data.error.message : "Erreur API";

            // On réessaie seulement si c'est surchargé / limite / modèle indisponible
            if (![404, 429, 500, 503].includes(r.status)) break;
        } catch (e) {
            derniereErreur = "Le serveur n'a pas pu joindre l'IA.";
        }

        if (i < ESSAIS.length - 1) await attendre(800);
    }

    return res.status(502).json({
        error: "L'IA est très sollicitée en ce moment. Réessaie dans quelques secondes. (" + derniereErreur + ")"
    });
};

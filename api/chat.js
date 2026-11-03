// Fonction serveur Vercel : /api/chat (version Groq, clé gratuite)
// La clé est lue dans les variables d'environnement Vercel : GROQ_API_KEY

const SYSTEME =
    "Tu es DJASBI AI, un assistant éducatif pour les élèves et étudiants. " +
    "Réponds dans la langue de l'élève (français par défaut). " +
    "Explique de façon claire, simple et étape par étape, avec un ton encourageant. " +
    "Pour un exercice, guide l'élève vers la solution et donne le résultat final avec le raisonnement. " +
    "Si une photo est envoyée, lis l'énoncé avec soin et dis-le si quelque chose est illisible. " +
    "Reste concis. Si la question n'est pas scolaire, réponds brièvement et ramène la conversation vers l'apprentissage.";

// Modèle qui lit le texte ET les images. Modifiable via la variable Vercel GROQ_MODEL
const MODELE = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

function versOpenAI(content) {
    if (typeof content === "string") return content;
    return content.map(function (b) {
        if (b.type === "image") {
            return {
                type: "image_url",
                image_url: { url: "data:" + b.source.media_type + ";base64," + b.source.data }
            };
        }
        return { type: "text", text: b.text };
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    const cle = process.env.GROQ_API_KEY;
    if (!cle) {
        return res.status(500).json({ error: "Clé manquante côté serveur (GROQ_API_KEY)." });
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

    const corps = [{ role: "system", content: SYSTEME }].concat(
        messages.map(function (m) {
            return { role: m.role, content: versOpenAI(m.content) };
        })
    );

    try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": "Bearer " + cle
            },
            body: JSON.stringify({
                model: MODELE,
                messages: corps,
                max_tokens: 1500
            })
        });

        const data = await r.json();

        if (!r.ok) {
            const detail = data && data.error && data.error.message ? data.error.message : "Erreur API";
            return res.status(502).json({ error: detail });
        }

        let reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
        reply = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        return res.status(200).json({ reply: reply || "Je n'ai pas pu générer de réponse." });
    } catch (e) {
        return res.status(500).json({ error: "Le serveur n'a pas pu joindre l'IA." });
    }
};

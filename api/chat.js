const SYSTEME =
    "Tu es DJASBI AI, un assistant éducatif pour les élèves et étudiants. " +
    "Réponds dans la langue de l'élève (français par défaut). " +
    "Explique de façon claire, simple et étape par étape, avec un ton encourageant. " +
    "Pour un exercice, guide l'élève vers la solution et donne le résultat final avec le raisonnement. " +
    "Si une photo est envoyée, lis l'énoncé avec soin et dis-le si quelque chose est illisible. " +
    "Reste concis. Si la question n'est pas scolaire, réponds brièvement et ramène la conversation vers l'apprentissage.";

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    const cle = process.env.ANTHROPIC_API_KEY;
    if (!cle) {
        return res.status(500).json({ error: "Clé API manquante côté serveur (ANTHROPIC_API_KEY)." });
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

    try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": cle,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-haiku-5-5",
                max_tokens: 1000,
                system: SYSTEME,
                messages: messages
            })
        });

        const data = await r.json();

        if (!r.ok) {
            const detail = data && data.error && data.error.message ? data.error.message : "Erreur API";
            return res.status(502).json({ error: detail });
        }

        const reply = (data.content || [])
            .filter(function (b) { return b.type === "text"; })
            .map(function (b) { return b.text; })
            .join("\n");

        return res.status(200).json({ reply: reply || "Je n'ai pas pu générer de réponse." });
    } catch (e) {
        return res.status(500).json({ error: "Le serveur n'a pas pu joindre l'IA." });
    }
};

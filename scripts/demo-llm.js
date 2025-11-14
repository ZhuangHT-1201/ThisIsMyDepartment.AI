#!/usr/bin/env node
/*
 * Simple demo script that mirrors the in-game LLMAgent bridge.
 * It cycles through canned responses to demonstrate the dialogue flow.
 */

const cannedReplies = [
    "Hey there! I'm DemoBot. Try asking me about the venue or the controls.",
    "You can move with WASD or the arrow keys. Walk up to people and press E to interact!",
    "This demo bot cycles through a few canned replies instead of calling a real LLM.",
    "Hook up your Python agent by replacing this bridge in demoLLMBridge.ts."
];

const keywordHints = [
    { keyword: /hello|hi|hey/i, reply: "Hello! Great to meet you." },
    { keyword: /controls?|move/i, reply: "Use WASD or arrow keys to move, press E to interact." },
    { keyword: /llm|agent/i, reply: "Swap the demo bridge with your Python backend to get real AI replies." },
    { keyword: /goodbye|bye/i, reply: "See you later!" }
];

const historyReplies = new Map();

function pickReply(sessionKey, message) {
    const normalized = message.trim();
    if (!normalized) {
        return "Say something and I'll respond!";
    }
    const keyword = keywordHints.find(hint => hint.keyword.test(normalized));
    if (keyword) {
        return keyword.reply;
    }
    const nextIndex = (historyReplies.get(sessionKey) ?? 0) % cannedReplies.length;
    historyReplies.set(sessionKey, nextIndex + 1);
    return cannedReplies[nextIndex];
}

function runDemo() {
    const sessionKey = "demo-bot:cli";
    const prompts = [
        "Hello there!",
        "How do I move around?",
        "What powers this bot?",
        "Thanks!"
    ];

    console.log("Demo conversation with DemoBot:\n");
    let round = 1;
    for (const message of prompts) {
        const reply = pickReply(sessionKey, message);
        console.log(`You (${round}): ${message}`);
        console.log(`DemoBot: ${reply}\n`);
        round++;
    }
}

if (require.main === module) {
    runDemo();
}

module.exports = { runDemo };

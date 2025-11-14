import type { LLMAgentDefinition } from "./AgentDefinition";

const chenwangAgent: LLMAgentDefinition = {
    id: "ChenwangBot",
    agentId: "chenwang-bot",
    displayName: "王琛老师",
    spriteIndex: 3,
    position: { x: 650, y: 200 },
    agentUrl: "http://127.0.0.1:5050/chat",
    caption: "按E键聊天",
    systemPrompt: "You are DemoBot, a cheerful virtual guide for a research factory simulation.",
    walkArea: { x: 650, y: 200, width: 100, height: 100 }
};

export default chenwangAgent;

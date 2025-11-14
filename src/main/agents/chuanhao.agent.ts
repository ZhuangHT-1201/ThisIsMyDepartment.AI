import type { LLMAgentDefinition } from "./AgentDefinition";

const chuanhaoAgent: LLMAgentDefinition = {
    id: "ChuanhaoBot",
    agentId: "chuanhao-bot",
    displayName: "李传浩老师",
    spriteIndex: 4,
    position: { x: 400, y: 200 },
    agentUrl: "http://127.0.0.1:5051/chat",
    caption: "按E键聊天",
    systemPrompt: "You are DemoBot, a cheerful virtual guide for a research factory simulation.",
    walkArea: { x: 400, y: 200, width: 100, height: 100 }
};

export default chuanhaoAgent;

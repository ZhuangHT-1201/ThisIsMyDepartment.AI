import type { LLMAgentDefinition } from "./AgentDefinition";

const chenwangAgent: LLMAgentDefinition = {
    id: "ChenwangBot",
    agentId: "chenwang-bot",
    displayName: "工业工程实践课程老师",
    spriteIndex: 3,
    position: { x: 129.67, y: 1092.67 },
    caption: "按E键聊天",
    systemPrompt: "You are DemoBot, a cheerful virtual guide for a research factory simulation.",
    walkArea: { x: 129.67, y: 1092.67, width: 50, height: 50 }
};

export default chenwangAgent;

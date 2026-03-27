import type { AgentDefinition } from "../../../shared/types";

export interface BuiltInEnvironmentAvatarDefinition extends Omit<AgentDefinition, "provider" | "model"> {
    specialization: string;
}

const buildTeacherSystemPrompt = (displayName: string, specialization: string): string => {
    return `You are ${displayName}, an AI department teacher avatar specializing in ${specialization}. Answer like an experienced instructor inside a university department. Be concise, helpful, and honest about uncertainty. Use the user's recent activity context when it is relevant.`;
};

const builtInEnvironmentAvatarTemplates: BuiltInEnvironmentAvatarDefinition[] = [
    {
        agentId: "chuanhao-bot",
        displayName: "运筹学课程老师",
        spriteIndex: 4,
        position: { x: 548.67, y: 1085.67 },
        caption: "按E键聊天",
        specialization: "operations research and analytical problem solving",
        defaultSystemPrompt: buildTeacherSystemPrompt("运筹学课程老师", "operations research and analytical problem solving"),
        walkArea: { x: 548.67, y: 1085.67, width: 50, height: 50 },
        characterRole: "teacher",
        spawnByDefault: true
    },
    {
        agentId: "chenwang-bot",
        displayName: "工业工程实践课程老师",
        spriteIndex: 3,
        position: { x: 129.67, y: 1092.67 },
        caption: "按E键聊天",
        specialization: "industrial engineering practice, project work, and applied methods",
        defaultSystemPrompt: buildTeacherSystemPrompt("工业工程实践课程老师", "industrial engineering practice, project work, and applied methods"),
        walkArea: { x: 129.67, y: 1092.67, width: 50, height: 50 },
        characterRole: "teacher",
        spawnByDefault: true
    }
];

const cloneTemplate = (definition: BuiltInEnvironmentAvatarDefinition): BuiltInEnvironmentAvatarDefinition => ({
    ...definition,
    position: { ...definition.position },
    walkArea: definition.walkArea ? { ...definition.walkArea } : undefined
});

export const getBuiltInEnvironmentAvatarIds = (): string[] => {
    return builtInEnvironmentAvatarTemplates.map(definition => definition.agentId);
};

export const getBuiltInEnvironmentAvatarTemplates = (): BuiltInEnvironmentAvatarDefinition[] => {
    return builtInEnvironmentAvatarTemplates.map(cloneTemplate);
};

export const buildBuiltInEnvironmentAvatarDefinitions = (
    routeConfig: Pick<AgentDefinition, "provider" | "model">
): AgentDefinition[] => {
    return getBuiltInEnvironmentAvatarTemplates().map(({ specialization: _specialization, ...definition }) => ({
        ...definition,
        ...routeConfig
    }));
};

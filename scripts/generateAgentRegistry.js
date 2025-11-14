const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "src", "main", "agents");
const outputPath = path.join(projectRoot, "registry.generated.ts");

function collectAgentFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith(".agent.ts"))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));
}

function buildFileContent(files) {
    const header = "import type { LLMAgentDefinition } from \"./AgentDefinition\";";
    if (files.length === 0) {
        return `${header}\n\nconst definitions: LLMAgentDefinition[] = [];\n\nexport default definitions;\n`;
    }

    const importLines = files.map((fileName, index) => {
        const importName = `agent${index}`;
    const withoutExtension = fileName.replace(/\.ts$/, "");
    const relativePath = `./${withoutExtension.replace(/\\/g, "/")}`;
        return `import ${importName} from \"${relativePath}\";`;
    });

    const definitionLines = files.map((_, index) => `    agent${index},`);

    return [
        header,
        ...importLines,
        "",
        "const definitions: LLMAgentDefinition[] = [",
        ...definitionLines,
        "];",
        "",
        "export default definitions;",
        ""
    ].join("\n");
}

function main() {
    const agentFiles = collectAgentFiles(projectRoot);
    const content = buildFileContent(agentFiles);
    fs.writeFileSync(outputPath, content, "utf8");
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error("Failed to generate agent registry:", error);
        process.exitCode = 1;
    }
}

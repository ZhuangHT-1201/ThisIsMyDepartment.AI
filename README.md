# THUShundeBuilding.AI

This is an AI Town for interacting with the LLM agents developed by faculty members and students in the Department of Industrial Engineering at Tsinghua University.
It is developed based on the gather town implementation of [eweren](https://github.com/eweren/gather.town?tab=readme-ov-file), e.g. by adding support for LLM controlled characters.

![界面](https://github.com/cyrilli/THUShundeBuilding.AI/blob/main/resource/ShundeBuilding_demo.png)

## Development

### Getting started

* Install [Node.js](https://nodejs.org/)
* Install [Visual Studio Code](https://code.visualstudio.com/)
* Clone the source code:

  ```sh
  git clone git@github.com:eweren/gather.town.git
  ```

* Initially run `npm i` in the project folder to install/update dependencies.

### Building the game

In Visual Studio Code press *Ctrl-Shift-B* to start the compiler in watch mode. This compiles the
TypeScript sources in the `src` folder to JavaScript in the `lib` folder. It also watches the `src`
folder for changes so changed files are compiled on-save.

Alternatively you can run `npm i` on the CLI to compile the project once or
`npm run watch` to continuously compile the project in watch mode.

### Running the game in a browser

There are four alternatives to run the game in the browser:

* In Visual Studio Code press *Ctrl-Shift-D* and launch the `webpack-dev-server` and
  one of the available browsers that can be selected by clicking on the drop down menu next to
  the "launch" button.
* Run `npm start` and point your browser to <http://localhost:8000/>. The browser automatically
  reloads the game when changes are detected (You still need to run the compiler in watch mode in VS
  Code or on the CLI to receive code changes).
* If you already have a local webserver you can simply open the `index.html` file in the project
  folder in your browser. This only works with a http(s) URL, not with a file URL.
* Run `npm run dist` to package the game into the `dist` folder. Open the `dist/index.html` in your
  browser to run the game. To publish the game simply copy the contents of the `dist` folder to a
  public web server.

### Modifying the Scene
Install [Tiled](http://www.mapeditor.org/) and then use it to open `THUShundeBuilding.AI\assets\map\map.tiledmap.json`. Modify the scene and then save it. The changes will be reflected after re-compiliation.

### LLM controlled characters
Definitions of LLM controlled characters need to be put under `THUShundeBuilding.AI\src\main\agents`. See `chuanhao.agent.ts` for example:
```
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
```
The most important parameter here is `agentUrl` which specifies the url of LLM agent service. You need to run the LLM agent service in a separate commond line window and make sure it is using the same url. An example script for launching the LLM agent service is given in `THUShundeBuilding.AI\scripts\demo_llm_agent.py`, which is using LLM agent framework [HAMLET](https://github.com/MINDS-THU/HAMLET).

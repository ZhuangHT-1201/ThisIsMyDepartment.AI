# Project Brief

This project serves as the entry point for various LLM agent services in my department. It is modified from <https://github.com/eweren/gather.town>.

I want to conduct a complete cleanup and overhaul of this project, then release it as an open-source project for people who want to build such a virtual environment for their department. I want to rename the project to ThisIsMyDepartment.AI.

There are a couple of things that we need to make clear and work on.

1. We need a login and identity management method that is easy to use for other people who want to host their own services.

When other people host this, their users will probably jump from some other website that has already handled login. Then our app will need to get that identity information via POST. I think every company or university will have a different way to identify users. I am wondering if there is a generic and easy-to-use way so that other people can easily set up the service for their own department.

1. After logging in, each user should have a unique ID. For the user who logs in for the first time, they should enter a window where they can customize what the character looks like. This functionality was implemented in the original project and was disabled by me in later developments. Now I want you to fix this.

1. All the activities of the user should be saved and associated with their unique ID. In this app, such activities include chatting with other user-controlled characters, chatting with AI characters, and opening links in the iframe.

1. Currently, the only AI-controlled characters are the teacher characters in AgentDefinition.ts, chenwang.agent.ts, and chuanhao.agent.ts. To use them, we need to launch some Python script that handles the call to the LLM. I want to change this so that we do not need to launch separate services. Instead, our app will directly call the LLM. The context of the AI-controlled character will include the previously recorded activities and dialogues, as well as a system prompt. The users should be able to edit their own system prompt.

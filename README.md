World's first n8n client that manage workflow collections inside VSCode/Cursor/Antigravity

- Website: <a href="https://atom8n.com/" target="_blank">www.atom8n.com</a>
- Download the client extension: <a href="https://open-vsx.org/extension/atom8n/n8n-atom-v3" target="_blank">n8n Atom 3.0</a>
- Support: <a href="https://discord.gg/9MmAhtJFWW" target="_blank">atom8n Community</a>
- Docker installation:
```
docker volume create n8n_data

docker run --pull=always -it --rm --name n8n-atom -p 5888:5888 -v n8n_data:/home/node/.n8n atom8n/n8n:fork
```


<img width="2718" height="1618" alt="image" src="https://github.com/user-attachments/assets/8cc10306-e349-4cac-b5b7-e04cc9695ca0" />
<img width="2100" height="1358" alt="image" src="https://github.com/user-attachments/assets/6f53d124-27e8-45e2-935f-3933ad42ff12" />
<img width="2114" height="1496" alt="image" src="https://github.com/user-attachments/assets/c48534d1-742f-4981-b5eb-557f610015d2" />


## Story behind
As a developer working frequently with n8n workflows, I realized a core problem: **workflows couldn't be managed like code**.

**The problems I faced:**
- Workflows were stored in n8n's database, making version control impossible
- Every change required manual UI work, which was time-consuming and error-prone
- No way to review changes before deploying
- Couldn't leverage AI coding agents to build workflows automatically
- Had to switch between multiple tools, breaking my development flow

**The inspiration:**
I wanted to bring workflows into the file-based world so they could be committed to GitHub and version controlled like regular code. This would also allow developers to leverage AI coding assistants to efficiently build and iterate on workflows.

**The journey:**
I spent 2 days "vibe coding" with Antigravity to build this. The experience was incredible - I could input 100% in natural language and build workflows seamlessly, just like coding. In those 2 days, I:
- Forked the front-end from the official n8n repository
- Integrated n8n UI into a VSCode extension
- Implemented a file-based workflow system (.n8n format)
- Created the world's first extension to manage n8n workflows in an editor



![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n - Secure Workflow Automation for Technical Teams

n8n is a workflow automation platform that gives technical teams the flexibility of code with the speed of no-code. With 400+ integrations, native AI capabilities, and a fair-code license, n8n lets you build powerful automations while maintaining full control over your data and deployments.

![n8n.io - Screenshot](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-screenshot-readme.png)

## Key Capabilities

- **Code When You Need It**: Write JavaScript/Python, add npm packages, or use the visual interface
- **AI-Native Platform**: Build AI agent workflows based on LangChain with your own data and models
- **Full Control**: Self-host with our fair-code license or use our [cloud offering](https://app.n8n.cloud/login)
- **Enterprise-Ready**: Advanced permissions, SSO, and air-gapped deployments
- **Active Community**: 400+ integrations and 900+ ready-to-use [templates](https://n8n.io/workflows)

## Quick Start

Try n8n instantly with [npx](https://docs.n8n.io/hosting/installation/npm/) (requires [Node.js](https://nodejs.org/en/)):

```
npx n8n
```

Or deploy with [Docker](https://docs.n8n.io/hosting/installation/docker/):

```
docker volume create n8n_data
docker run -it --rm --name n8n -p 5888:5888 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Access the editor at http://localhost:5888

## Resources

- 📚 [Documentation](https://docs.n8n.io)
- 🔧 [400+ Integrations](https://n8n.io/integrations)
- 💡 [Example Workflows](https://n8n.io/workflows)
- 🤖 [AI & LangChain Guide](https://docs.n8n.io/advanced-ai/)
- 👥 [Community Forum](https://community.n8n.io)
- 📖 [Community Tutorials](https://community.n8n.io/c/tutorials/28)

## Support

Need help? Our community forum is the place to get support and connect with other users:
[community.n8n.io](https://community.n8n.io)

## License

n8n is [fair-code](https://faircode.io) distributed under the [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) and [n8n Enterprise License](https://github.com/n8n-io/n8n/blob/master/LICENSE_EE.md).

- **Source Available**: Always visible source code
- **Self-Hostable**: Deploy anywhere
- **Extensible**: Add your own nodes and functionality

[Enterprise licenses](mailto:license@n8n.io) available for additional features and support.

Additional information about the license model can be found in the [docs](https://docs.n8n.io/sustainable-use-license/).

## Contributing

Found a bug 🐛 or have a feature idea ✨? Check our [Contributing Guide](https://github.com/n8n-io/n8n/blob/master/CONTRIBUTING.md) to get started.

## Join the Team

Want to shape the future of automation? Check out our [job posts](https://n8n.io/careers) and join our team!

## What does n8n mean?

**Short answer:** It means "nodemation" and is pronounced as n-eight-n.

**Long answer:** "I get that question quite often (more often than I expected) so I decided it is probably best to answer it here. While looking for a good name for the project with a free domain I realized very quickly that all the good ones I could think of were already taken. So, in the end, I chose nodemation. 'node-' in the sense that it uses a Node-View and that it uses Node.js and '-mation' for 'automation' which is what the project is supposed to help with. However, I did not like how long the name was and I could not imagine writing something that long every time in the CLI. That is when I then ended up on 'n8n'." - **Jan Oberhauser, Founder and CEO, n8n.io**

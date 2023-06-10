import { init, Tiktoken } from "https://esm.sh/@dqbd/tiktoken@1.0.7/lite/init";
import { load } from "https://esm.sh/@dqbd/tiktoken@1.0.7/load";
import registry from "https://esm.sh/@dqbd/tiktoken@1.0.7/registry.json" assert { type: "json" };
import models from "https://esm.sh/@dqbd/tiktoken@1.0.7/model_to_encoding.json" assert { type: "json" };
import { Configuration, CreateChatCompletionResponse, CreateChatCompletionResponseChoicesInner, CreateCompletionResponseUsage, OpenAIApi } from 'https://esm.sh/openai@3.2.1';

type ObjectValues<T> = T[keyof T];
type Model = keyof typeof models
type Encoder = ObjectValues<typeof models>
type EncoderConfig = ObjectValues<typeof registry>
type Registry = Record<Encoder, EncoderConfig>;

let _init = false;

class Tokenizer {
    static _encoder: Tiktoken;
    static async tokenize(text: string, modelName?: Model) {
        if (!this._encoder) {
            this._encoder = await buildEncoder(modelName ?? "gpt-3.5-turbo");
        }
        return this._encoder.encode(text);
    }
}

class AIAgent {
    static _openAI: OpenAIApi;
    static OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

    static async createCompletion({
        systemPrompt,
        userPrompt,
        assistantPrompt = "",
        modelName,
    }: {
        systemPrompt: string,
        userPrompt: string,
        assistantPrompt?: string,
        modelName?: Model,
    }
    ) {
        let completion: CreateChatCompletionResponse;
        try {
            const resp = await this._openAI.createChatCompletion({
                model: modelName ?? "gpt-3.5-turbo",
                messages: [
                    {   role: "system",
                        content: systemPrompt,
                    },
                    {   role: "user",
                        content: userPrompt,
                    },
                    {   role: "assistant",
                        content: assistantPrompt,
                    },
                ],
                temperature: 0.7,
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0,
            });
            completion = resp.data;
        } catch(err) {
            console.error(`Failed to process completion: ${err}`);
            throw err;
        }
        return completion
    }

    static processCompletion(completion: CreateChatCompletionResponse) {
        const { choices, usage = {}, id: completion_id } = completion;
        const { total_tokens, prompt_tokens, completion_tokens } = usage as CreateCompletionResponseUsage
        const { message, finish_reason} = choices[0] as CreateChatCompletionResponseChoicesInner;
        if (!message) {
          throw new Error(`No message returned for completion_id: ${completion_id}`);
        }
        const { content: completionText } = message
        console.log(`total_tokens: ${total_tokens}, prompt_tokens: ${prompt_tokens}, completion_tokens: ${completion_tokens}`);
        console.log(`finish_reason: ${finish_reason}, completionText: ${completionText}`);
        // return {
        //     text: completionText,
        //     total_tokens,
        // };
        return completionText
    }

    static async summarize(text: string, modelName?: Model) {
        if (!this._openAI) {
            const configuration = new Configuration({
                apiKey: this.OPENAI_API_KEY,
            });
            this._openAI = new OpenAIApi(configuration);
        }
        const cleanText = text
            .replace(/`/g, '')
            .replace(/\n{2,}/g, '\n')
            .replace(/\s{2,}/g, ' ')
            .trim();
        const systemPrompt = "```" + `\n${cleanText}\n` + "```"
        const userPrompt = "tldr;"
        const completion = await this.createCompletion({systemPrompt, userPrompt, modelName});
        return this.processCompletion(completion);
    }

    static async summarizeBatch(texts: string[], modelName?: Model) {
        const summaries = await Promise.all(texts.map(text => this.summarize(text, modelName)));
        // MARK: unify into one summary
        console.log(JSON.stringify(summaries))
    }
}


async function loadModel(modelName: Model) {
    if (!_init) {
        // Initialize the wasm via discussion in https://github.com/dqbd/tiktoken/issues/22
        await init(async (imports) => {
            const req = await fetch('https://esm.sh/@dqbd/tiktoken@1.0.7/lite/tiktoken_bg.wasm')
            return WebAssembly.instantiate(await req.arrayBuffer(), imports)
        });
        _init = true;
    }
    // MARK: gpt-3.5-turbo uses the cl100k_base encoding whereas text-davinci-003 uses the p50k_base
    return await load((registry as Registry)[models[modelName]]);
}
async function buildEncoder(modelName: Model) {
    const model = await loadModel(modelName);
    return new Tiktoken(
        model.bpe_ranks,
        model.special_tokens,
        model.pat_str
    );
}

async function tokenize(text: string, modelName?: Model) {
    modelName = modelName ?? "gpt-3.5-turbo"
    const encoder = await buildEncoder(modelName);
    const tokens = encoder.encode(text);
    encoder.free();
    return tokens;
}

function* batchify<T>(arr: T[], n = 5): Generator<T[], void> {
    for (let i = 0; i < arr.length; i += n) {
      yield arr.slice(i, i + n);
    }
}

async function splitText(text: string, maxTokens = 2048) {
    const separator = " ";
    const wordGroups = batchify(text.split(`${separator}`), 50);
    const finalChunks: string[] = [];
    let accumulated = 0;
    let growingChunk = "";
    for (let words of wordGroups) { // MARK: adding some redundancy via text overlap could help
        words = words.filter(w => w && w.trim())
        const fragment = words.join(separator);
        // console.log(`Fragment: ${fragment}`);
        const tokens = (await Tokenizer.tokenize(fragment)).length;
        if (accumulated + tokens < maxTokens) { // Expand growing chunk
            growingChunk += `${fragment}${separator}`;
            accumulated += tokens;
        } else if (tokens > maxTokens) { // Unexpected case
            console.warn(`Fragment '${fragment}' of size ${tokens} exceeds limit! Skipping...`)
        }
        else { // Insert new chunk
            finalChunks.push(growingChunk.trim());
            growingChunk = fragment;
            accumulated = tokens;
        }
    }
    if (growingChunk && growingChunk.length) {
        finalChunks.push(growingChunk.trim());
    }
    return finalChunks
}

async function demo() {
    const text = await Deno.readTextFile("./snyk2.log");
    const texts = await splitText(text);
    // console.log(`texts: ${JSON.stringify(texts, null, 2)}`);
    for (const line of texts) {
        const tokens = (await Tokenizer.tokenize(line)).length;
        console.log(`count: ${tokens}`)
    }
    // await AIAgent.summarize(texts[1]);
    await AIAgent.summarizeBatch(texts);
}

async function demo2() {
    const texts = ["Snyk's CPO and SVP of Engineering discuss the developer security vision and the challenges faced by developers due to increased pace of development and AI. They talk about Snyk's principles for enabling developer security, which aims to make it easy for developers to adopt Snyk and focus on easy fixes instead of expecting them to be security experts. They introduce ASPM (Application Security Posture Management) which provides a 360-degree view of all app components from the IDE to the cloud. Snyk also announces that their AI will officially be known as DeepCode AI, which will help developers fix issues and appsec teams search their code in a unique way and create custom detection rules. The demo showcases how DeepCode AI can be used for automated fixes, code search, and custom rules.","The Sneak platform offers two AI-based tools to empower developers to write secure code: DeepCode AI Fix and a Symbolic AI. The DeepCode AI Fix uses a program analysis engine with an in-house deep learning-based language model trained on millions of lines of code from open-source projects to generate automatic fixes for vulnerabilities. The Symbolic AI tool allows users to create their own custom rules using a logic solver language and data flow analysis, which can be integrated into the Sneak IDE plugin for developers to use while coding. Both tools aim to shift security left and empower developers to write secure code from the start.","Snyk has announced a new capability called \"Insights\", which aims to help organizations reduce noise, prioritize based on risk, and focus on the issues that pose the greatest amount of risk to their business. Insights will be made available in open beta starting July 12th and will enable users to prioritize based on whether the vulnerability applies to the operating system, whether the container image is deployed, and whether the container image has a configured path to the internet. By providing more context from the whole application, Insights aims to help customers narrow down the list of issues to address first and focus on those that matter most.","Snyk has announced several new features and initiatives to enhance its developer-first approach to application security. These include Auto-Developers, which provides AI-powered code fixes; a new prioritization strategy, Insights, which allows developers to address vulnerabilities based on their business risk; and the acquisition of Enso Security, a pioneer in the field of application security posture management (ASPM). The integration of Enso's ASPM solution will enable Snyk to extend its developer security platform so that security teams can govern app security at scale and eliminate coverage gaps across their business. Snyk is also building supply chain security tools to help organizations tackle challenges in this space.","Sneak has announced several new features and improvements to its platform, including the launch of a new AI engine called DeepCode AI, which will help developers fix security issues with a low barrier to entry. The company has also introduced custom search rules and enriched S-bomb data through its Parlay project. Sneak Learn has also been updated with new features, including quizzes and progress tracking. Finally, the company has partnered with NYU Tandon School of Engineering to offer a custom learning path for students looking to improve their security skills.","Snyk has announced a number of new security features, including Snyk Infrastructure as Code (IaC), which provides DevOps teams with visibility and control over security in infrastructure-as-code deployments. The company also introduced Snyk Code, which offers automated code scanning and vulnerability detection for developers. Additionally, Snyk Insights provides a dashboard view of an organization's open source security posture, while Snyk's Container and Kubernetes offerings now include the ability to identify public-facing containers and configurations. Finally, Snyk announced its acquisition of security company FossID, which specializes in identifying vulnerabilities in open source software components. All of these features are available at no additional cost to existing Snyk customers."]
    // await AIAgent.summarize(texts[1]);
    await AIAgent.summarize(texts.join("\n"));
}

if (import.meta.main) {
    if (!AIAgent.OPENAI_API_KEY) throw new Error(`Missing OPENAI_API_KEY!`);
    await demo2();
}

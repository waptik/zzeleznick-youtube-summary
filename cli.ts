import { parse } from "https://deno.land/std@0.184.0/flags/mod.ts";
import { YoutubeTranscript } from "./main.ts";

const flags = parse(Deno.args, {
  string: ["url", "lang", "country"],
  default: { lang: "en", country: "US" },
});

const url = flags.url || Deno.args[0];

const config = {
    lang: flags.lang,
    country: flags.country,
};

const transcript = await YoutubeTranscript.fetchTranscript(url, config);
console.log(JSON.stringify(transcript, null, 2));

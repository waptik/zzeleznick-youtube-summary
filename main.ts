// MARK: adapted from https://www.npmjs.com/package/youtube-transcript
// MIT Licensed

const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

const YouTubeKey = {
  apiKey: "INNERTUBE_API_KEY",
  serializedShareEntity: "serializedShareEntity",
  visitorData: "VISITOR_DATA",
  sessionId: "sessionId",
  clickTrackingParams: "clickTrackingParams",
} as const;

type ObjectValues<T> = T[keyof T];
type YouTubeKeyRaw = ObjectValues<typeof YouTubeKey>;

export class YoutubeTranscriptError extends Error {
  constructor(message: string) {
    super(`[YoutubeTranscript] 🚨 ${message}`);
  }
}

export interface TranscriptConfig {
  lang?: string;
  country?: string;
}

export interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
}

export interface TranscriptData {
  responseContext: {
    serviceTrackingParams: {
      service: string;
      params: {
        key: string;
        value: string;
      }[];
    }[];
    mainAppWebResponseContext: {
      loggedOut: boolean;
      trackingParam: string;
    };
    webResponseContextExtensionData: {
      hasDecorated: boolean;
    };
  };
  actions: {
    clickTrackingParams: string;
    updateEngagementPanelAction: {
      targetId: string;
      content: {
        transcriptRenderer: {
          body: {
            transcriptBodyRenderer: {
              cueGroups: {
                transcriptCueGroupRenderer: {
                  formattedStartOffset: {
                    simpleText: string;
                  };
                  cues: {
                    transcriptCueRenderer: {
                      cue: {
                        simpleText: string;
                      };
                      startOffsetMs: string;
                      durationMs: string;
                    };
                  }[];
                };
              }[];
            };
          };
        };
      };
    };
  }[];
}

/**
 * An extensible class to fetch a transcript from a given YouTube Video
 */
export class YoutubeTranscript {
  /**
   * Fetch a transcript from a YouTube Video which includes the text and timestamp metadata
   * @param videoId Video url or video identifier
   * @param config Options for specifying a Country and Language ISO
   */
  static async fetchTranscript(
    videoId: string,
    config?: TranscriptConfig,
  ): Promise<TranscriptSegment[]> {
    const identifier = this.extractVideoId(videoId);
    try {
      const textResponse = await fetch(
        `https://www.youtube.com/watch?v=${identifier}`,
      );
      const body = await textResponse.text();
      const apiKey = this.extractValue(body, YouTubeKey.apiKey);
      if (!apiKey || !apiKey.length) {
        throw new YoutubeTranscriptError(
          `Failed to extract ${YouTubeKey.apiKey}`,
        );
      }
      const transcriptResponse = await fetch(
        `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
        {
          method: "POST",
          body: JSON.stringify(this.generateRequest(body, config)),
          headers: {
            "content-type": "application/json",
          },
        },
      );
      if (!transcriptResponse) {
        throw new YoutubeTranscriptError(
          "Empty response from transcript endpoint",
        );
      }
      const transcriptData = await transcriptResponse.json();
      return this.parseTranscriptData(transcriptData as TranscriptData);
    } catch (err) {
      throw new YoutubeTranscriptError(err);
    }
  }
  /**
   * Fetch only the transcript text from a YouTube Video
   * @param videoId Video url or video identifier
   * @param config Options for specifying a Country and Language ISO
   */
  static async fetchTranscriptText(
    videoId: string,
    config?: TranscriptConfig,
  ): Promise<string> {
    const segments = await this.fetchTranscript(videoId, config);
    let out = "";
    for (const { text } of segments) {
      out += `${text} `;
    }
    return out.trimEnd();
  }

  /**
   * Parse TranscriptData from the "get_transcript" endpoint
   * @param transcriptData TranscriptData returned by the "get_transcript" endpoint
   */
  static parseTranscriptData(transcriptData: TranscriptData) {
    const { actions = [] } = transcriptData;
    const cueGroups =
      actions[0]?.updateEngagementPanelAction.content.transcriptRenderer.body
        .transcriptBodyRenderer.cueGroups;
    return cueGroups.map((cueGroup) => {
      const { cue, durationMs, startOffsetMs } =
        cueGroup.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer;
      return {
        text: cue.simpleText,
        duration: parseInt(durationMs),
        offset: parseInt(startOffsetMs),
      };
    });
  }

  /**
   * Generate tracking params for YouTube API
   * @param page
   * @param config
   */
  static generateRequest(page: string, config?: TranscriptConfig) {
    const clientScreenNonce = this.generateNonce();
    const params = this.extractValue(page, YouTubeKey.serializedShareEntity);
    const visitorData = this.extractValue(page, YouTubeKey.visitorData);
    const sessionId = this.extractValue(page, YouTubeKey.sessionId);
    const clickTrackingParams = this.extractValue(
      page,
      YouTubeKey.clickTrackingParams,
    );
    return {
      context: {
        client: {
          hl: config?.lang || "en",
          gl: config?.country || "US",
          visitorData,
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)",
          clientName: "WEB",
          clientVersion: "2.20200925.01.00",
          osName: "Macintosh",
          osVersion: "10_15_4",
          browserName: "Chrome",
          browserVersion: "85.0f.4183.83",
          screenWidthPoints: 1440,
          screenHeightPoints: 770,
          screenPixelDensity: 2,
          utcOffsetMinutes: 120,
          userInterfaceTheme: "USER_INTERFACE_THEME_LIGHT",
          connectionType: "CONN_CELLULAR_3G",
        },
        request: {
          sessionId,
          internalExperimentFlags: [],
          consistencyTokenJars: [],
        },
        user: {},
        clientScreenNonce,
        clickTracking: {
          clickTrackingParams,
        },
      },
      params,
    };
  }

  /**
   * Extract value from html page based on required key
   * @param page html page
   * @param key key name
   */
  static extractValue(page: string, key: YouTubeKeyRaw) {
    return page.split(`"${key}":"`)[1]?.split(`"`)[0];
  }

  /**
   * Extract video id from url or string
   * @param videoId video url or video id
   */
  static extractVideoId(videoId: string) {
    if (videoId.length === 11) {
      return videoId;
    }
    const matchId = videoId.match(RE_YOUTUBE);
    if (matchId && matchId.length) {
      return matchId[1];
    }
    throw new YoutubeTranscriptError(
      "Malformed YouTube video url or ID.",
    );
  }

  /**
   * Generate nonce for clientScreenNonce as part of YouTube API
   */
  static generateNonce() {
    const rnd = Math.random().toString();
    const alphabet =
      "ABCDEFGHIJKLMOPQRSTUVWXYZabcdefghjijklmnopqrstuvwxyz0123456789";
    const jda = [
      alphabet + "+/=",
      alphabet + "+/",
      alphabet + "-_=",
      alphabet + "-_.",
      alphabet + "-_",
    ];
    const b = jda[3];
    const a = [];
    for (let i = 0; i < rnd.length - 1; i++) {
      a.push(rnd[i].charCodeAt(i));
    }
    let c = "";
    let d = 0;
    let m, n, q, r, f, g;
    while (d < a.length) {
      f = a[d];
      g = d + 1 < a.length;

      if (g) {
        m = a[d + 1];
      } else {
        m = 0;
      }
      n = d + 2 < a.length;
      if (n) {
        q = a[d + 2];
      } else {
        q = 0;
      }
      r = f >> 2;
      f = ((f & 3) << 4) | (m >> 4);
      m = ((m & 15) << 2) | (q >> 6);
      q &= 63;
      if (!n) {
        q = 64;
        if (!q) {
          m = 64;
        }
      }
      c += b[r] + b[f] + b[m] + b[q];
      d += 3;
    }
    return c;
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) => {
    const url = "https://www.youtube.com/watch?v=46IEp7_mpdw";
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    console.log(JSON.stringify(transcript, null, 2));

    return new Response("Hello World");
  });
}

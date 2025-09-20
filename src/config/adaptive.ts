export const adaptiveConfig = {
  alpha: 0.8,
  beta: 0.3,
  english: {
    maxRepeat: 2, // avoid 3 consecutive same letter
    bigramsWeight: 0.2,
  },
  chinese: {
    minChunk: 2,
    maxChunk: 4,
  },
}

export default adaptiveConfig



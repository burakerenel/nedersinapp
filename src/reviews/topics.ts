import { ApiException } from '../common/exceptions/api.exception';

export interface TopicSplit {
  /** Birleşim; arama ve `topic` filtresi için. */
  topics: string[];
  likedTopics: string[];
  dislikedTopics: string[];
}

/** Eski tek `topics` listesi puana göre dağıtılır (iş listesi #31 kararı). */
export const LEGACY_DISLIKE_MAX_RATING = 2;
export const LEGACY_LIKE_MIN_RATING = 4;

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

/**
 * Yeni alanlar (`likedTopics` / `dislikedTopics`) verildiyse onları kullanır;
 * sadece eski `topics` geldiyse puana göre dağıtır: 1-2 → sevilmeyen,
 * 4-5 → sevilen, 3 → ikisine de yazılmaz (yalnızca `topics`).
 */
export function splitTopics(
  input: {
    topics?: string[] | null;
    likedTopics?: string[] | null;
    dislikedTopics?: string[] | null;
  },
  rating: number,
): TopicSplit {
  const hasNew =
    input.likedTopics !== undefined || input.dislikedTopics !== undefined;

  if (hasNew) {
    const liked = uniq(input.likedTopics ?? []);
    const disliked = uniq(input.dislikedTopics ?? []);
    const overlap = liked.filter((t) => disliked.includes(t));
    if (overlap.length) {
      throw ApiException.validation(
        'Aynı konu hem sevilen hem sevilmeyen olamaz',
        { dislikedTopics: `likedTopics ile çakışıyor: ${overlap.join(', ')}` },
      );
    }
    return {
      topics: uniq([...liked, ...disliked]),
      likedTopics: liked,
      dislikedTopics: disliked,
    };
  }

  const topics = uniq(input.topics ?? []);
  return {
    topics,
    likedTopics: rating >= LEGACY_LIKE_MIN_RATING ? topics : [],
    dislikedTopics: rating <= LEGACY_DISLIKE_MAX_RATING ? topics : [],
  };
}

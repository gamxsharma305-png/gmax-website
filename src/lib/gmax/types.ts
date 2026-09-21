export type ProviderId = "youtube" | "itunes" | "saavn" | "audius";

export type Artist = {
  id: string;
  name: string;
  imageUrl?: string;
};

export type Track = {
  id: string;
  title: string;
  artist: Artist;
  albumImageUrl: string;
  duration: number;
  provider: ProviderId;
  sourceId: string;
  album?: string;
  explicit?: boolean;
  isVideo?: boolean;
  videoId?: string;
  previewUrl?: string;
  streamUrl?: string;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  creator: string;
  coverImageUrl: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
};

export type SearchResults = {
  query: string;
  tracks: Track[];
  artists: { id: string; name: string; imageUrl: string; subtitle?: string }[];
  albums: {
    id: string;
    title: string;
    artist: string;
    coverImageUrl: string;
    year?: string;
  }[];
};

export type RepeatMode = "off" | "all" | "one";

export type Gender = "male" | "female" | "unspecified";

export type UserProfile = {
  name: string;
  gender: Gender;
  completed: boolean;
};

export type HistoryEntry = {
  id: string;
  track: Track;
  playedAt: number;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  query: string;
};

export const emptySearchResults = (query = ""): SearchResults => ({
  query,
  tracks: [],
  artists: [],
  albums: [],
});

export const trackKey = (provider: ProviderId, sourceId: string) =>
  `${provider}:${sourceId}`;

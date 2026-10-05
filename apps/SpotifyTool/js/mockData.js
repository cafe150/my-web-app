/**
 * Spotify Web API Mock Data
 * Spotify未連携時やデモプレビュー時に全画面でフル機能を体感できるモックデータセット
 */

export const mockUser = {
  id: "spotify_music_explorer",
  display_name: "Alex Soundwave",
  email: "alex.soundwave@example.com",
  country: "JP",
  product: "premium",
  followers: { total: 1420 },
  images: [
    {
      url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80",
      height: 300,
      width: 300
    }
  ],
  external_urls: {
    spotify: "https://open.spotify.com"
  }
};

export const mockPlayback = {
  is_playing: true,
  progress_ms: 148500,
  device: {
    id: "device_macbook_pro",
    is_active: true,
    name: "MacBook Pro Studio",
    type: "Computer",
    volume_percent: 78
  },
  shuffle_state: true,
  repeat_state: "context",
  item: {
    id: "track_midnight_city",
    name: "Midnight City",
    duration_ms: 243000,
    popularity: 88,
    preview_url: null,
    artists: [
      { name: "M83", id: "art_m83", external_urls: { spotify: "https://open.spotify.com" } }
    ],
    album: {
      name: "Hurry Up, We're Dreaming",
      release_date: "2011-10-18",
      images: [
        {
          url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
          height: 640,
          width: 640
        }
      ]
    },
    external_urls: { spotify: "https://open.spotify.com" }
  }
};

export const mockRecentlyPlayed = {
  items: [
    {
      played_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      track: {
        id: "rp_1",
        name: "Starboy",
        duration_ms: 230453,
        popularity: 92,
        artists: [{ name: "The Weeknd" }, { name: "Daft Punk" }],
        album: {
          name: "Starboy",
          images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" }]
        },
        external_urls: { spotify: "https://open.spotify.com" }
      }
    },
    {
      played_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      track: {
        id: "rp_2",
        name: "Blinding Lights",
        duration_ms: 200040,
        popularity: 95,
        artists: [{ name: "The Weeknd" }],
        album: {
          name: "After Hours",
          images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }]
        },
        external_urls: { spotify: "https://open.spotify.com" }
      }
    },
    {
      played_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      track: {
        id: "rp_3",
        name: "Get Lucky",
        duration_ms: 248413,
        popularity: 84,
        artists: [{ name: "Daft Punk" }, { name: "Pharrell Williams" }],
        album: {
          name: "Random Access Memories",
          images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }]
        },
        external_urls: { spotify: "https://open.spotify.com" }
      }
    },
    {
      played_at: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
      track: {
        id: "rp_4",
        name: "As It Was",
        duration_ms: 167303,
        popularity: 91,
        artists: [{ name: "Harry Styles" }],
        album: {
          name: "Harry's House",
          images: [{ url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80" }]
        },
        external_urls: { spotify: "https://open.spotify.com" }
      }
    },
    {
      played_at: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
      track: {
        id: "rp_5",
        name: "Levitating",
        duration_ms: 203064,
        popularity: 87,
        artists: [{ name: "Dua Lipa" }],
        album: {
          name: "Future Nostalgia",
          images: [{ url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" }]
        },
        external_urls: { spotify: "https://open.spotify.com" }
      }
    },
    {
      played_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
      track: {
        id: "rp_6",
        name: "Bad Guy",
        duration_ms: 194087,
        popularity: 85,
        artists: [{ name: "Billie Eilish" }],
        album: {
          name: "When We All Fall Asleep, Where Do We Go?",
          images: [{ url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80" }]
        },
        external_urls: { spotify: "https://open.spotify.com" }
      }
    }
  ]
};

export const mockTopTracks = {
  short_term: {
    items: [
      { id: "tt_s1", name: "Midnight City", artists: [{ name: "M83" }], popularity: 94, album: { images: [{ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_s2", name: "Starboy", artists: [{ name: "The Weeknd" }, { name: "Daft Punk" }], popularity: 92, album: { images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_s3", name: "Blinding Lights", artists: [{ name: "The Weeknd" }], popularity: 95, album: { images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_s4", name: "Resonance", artists: [{ name: "HOME" }], popularity: 86, album: { images: [{ url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_s5", name: "Sunflower", artists: [{ name: "Post Malone" }, { name: "Swae Lee" }], popularity: 90, album: { images: [{ url: "https://images.unsplash.com/photo-1445985543469-433ecba6244f?w=300&auto=format&fit=crop&q=80" }] } }
    ]
  },
  medium_term: {
    items: [
      { id: "tt_m1", name: "Get Lucky", artists: [{ name: "Daft Punk" }], popularity: 89, album: { images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_m2", name: "Midnight City", artists: [{ name: "M83" }], popularity: 94, album: { images: [{ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_m3", name: "Stay", artists: [{ name: "The Kid LAROI" }, { name: "Justin Bieber" }], popularity: 88, album: { images: [{ url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_m4", name: "Cruel Summer", artists: [{ name: "Taylor Swift" }], popularity: 96, album: { images: [{ url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_m5", name: "Save Your Tears", artists: [{ name: "The Weeknd" }], popularity: 91, album: { images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }] } }
    ]
  },
  long_term: {
    items: [
      { id: "tt_l1", name: "Bohemian Rhapsody", artists: [{ name: "Queen" }], popularity: 93, album: { images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_l2", name: "Instant Crush", artists: [{ name: "Daft Punk" }, { name: "Julian Casablancas" }], popularity: 87, album: { images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_l3", name: "The Less I Know The Better", artists: [{ name: "Tame Impala" }], popularity: 89, album: { images: [{ url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_l4", name: "Dreams", artists: [{ name: "Fleetwood Mac" }], popularity: 90, album: { images: [{ url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80" }] } },
      { id: "tt_l5", name: "Hotel California", artists: [{ name: "Eagles" }], popularity: 89, album: { images: [{ url: "https://images.unsplash.com/photo-1445985543469-433ecba6244f?w=300&auto=format&fit=crop&q=80" }] } }
    ]
  }
};

export const mockTopArtists = {
  short_term: {
    items: [
      { id: "ta_s1", name: "The Weeknd", popularity: 98, followers: { total: 84300000 }, genres: ["canadian pop", "pop", "r&b"], images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_s2", name: "Daft Punk", popularity: 88, followers: { total: 12500000 }, genres: ["electro", "filter house", "synthpop"], images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_s3", name: "M83", popularity: 82, followers: { total: 2900000 }, genres: ["shoegaze", "indietronica", "ambient"], images: [{ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_s4", name: "Taylor Swift", popularity: 100, followers: { total: 110000000 }, genres: ["pop"], images: [{ url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_s5", name: "Tame Impala", popularity: 86, followers: { total: 7200000 }, genres: ["psychedelic rock", "neo-psychedelia"], images: [{ url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&auto=format&fit=crop&q=80" }] }
    ]
  },
  medium_term: {
    items: [
      { id: "ta_m1", name: "Daft Punk", popularity: 88, followers: { total: 12500000 }, genres: ["electro", "synthpop"], images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_m2", name: "The Weeknd", popularity: 98, followers: { total: 84300000 }, genres: ["pop", "r&b"], images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_m3", name: "Billie Eilish", popularity: 94, followers: { total: 92000000 }, genres: ["art pop", "electropop"], images: [{ url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_m4", name: "Coldplay", popularity: 90, followers: { total: 48000000 }, genres: ["permanent wave", "pop"], images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_m5", name: "Kendrick Lamar", popularity: 92, followers: { total: 29000000 }, genres: ["hip hop", "west coast rap"], images: [{ url: "https://images.unsplash.com/photo-1445985543469-433ecba6244f?w=300&auto=format&fit=crop&q=80" }] }
    ]
  },
  long_term: {
    items: [
      { id: "ta_l1", name: "Queen", popularity: 89, followers: { total: 47000000 }, genres: ["classic rock", "glam rock"], images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_l2", name: "Daft Punk", popularity: 88, followers: { total: 12500000 }, genres: ["electro", "french touch"], images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_l3", name: "Michael Jackson", popularity: 87, followers: { total: 39000000 }, genres: ["pop", "r&b", "soul"], images: [{ url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_l4", name: "Pink Floyd", popularity: 84, followers: { total: 19000000 }, genres: ["progressive rock", "psychedelic rock"], images: [{ url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&auto=format&fit=crop&q=80" }] },
      { id: "ta_l5", name: "David Bowie", popularity: 80, followers: { total: 11000000 }, genres: ["art rock", "glam rock"], images: [{ url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80" }] }
    ]
  }
};

export const mockSavedTracks = {
  total: 486,
  items: [
    { added_at: "2026-09-10T14:20:00Z", track: { name: "Espresso", artists: [{ name: "Sabrina Carpenter" }], popularity: 97, duration_ms: 175459, album: { name: "Short n' Sweet", images: [{ url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" }] } } },
    { added_at: "2026-09-02T09:12:00Z", track: { name: "Birds of a Feather", artists: [{ name: "Billie Eilish" }], popularity: 99, duration_ms: 196144, album: { name: "HIT ME HARD AND SOFT", images: [{ url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80" }] } } },
    { added_at: "2026-08-28T18:45:00Z", track: { name: "Good Luck, Babe!", artists: [{ name: "Chappell Roan" }], popularity: 96, duration_ms: 218423, album: { name: "Good Luck, Babe!", images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }] } } },
    { added_at: "2026-08-15T22:01:00Z", track: { name: "Taste", artists: [{ name: "Sabrina Carpenter" }], popularity: 94, duration_ms: 157279, album: { name: "Short n' Sweet", images: [{ url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80" }] } } },
    { added_at: "2026-08-01T11:30:00Z", track: { name: "Die With A Smile", artists: [{ name: "Lady Gaga" }, { name: "Bruno Mars" }], popularity: 98, duration_ms: 251667, album: { name: "Die With A Smile", images: [{ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80" }] } } }
  ]
};

export const mockSavedAlbums = {
  total: 58,
  items: [
    {
      added_at: "2026-09-01T10:00:00Z",
      album: {
        name: "Random Access Memories",
        release_date: "2013-05-17",
        total_tracks: 13,
        artists: [{ name: "Daft Punk" }],
        images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }]
      }
    },
    {
      added_at: "2026-08-20T15:00:00Z",
      album: {
        name: "After Hours",
        release_date: "2020-03-20",
        total_tracks: 14,
        artists: [{ name: "The Weeknd" }],
        images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }]
      }
    },
    {
      added_at: "2026-07-14T08:30:00Z",
      album: {
        name: "Currents",
        release_date: "2015-07-17",
        total_tracks: 13,
        artists: [{ name: "Tame Impala" }],
        images: [{ url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&auto=format&fit=crop&q=80" }]
      }
    },
    {
      added_at: "2026-06-11T12:00:00Z",
      album: {
        name: "Hurry Up, We're Dreaming",
        release_date: "2011-10-18",
        total_tracks: 22,
        artists: [{ name: "M83" }],
        images: [{ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80" }]
      }
    }
  ]
};

export const mockPlaylists = {
  total: 16,
  items: [
    {
      id: "pl_1",
      name: "Late Night Neon Drive",
      description: "Synthwave, retrowave and late night electronic pulses.",
      public: true,
      collaborative: false,
      tracks: { total: 64 },
      images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" }],
      external_urls: { spotify: "https://open.spotify.com" }
    },
    {
      id: "pl_2",
      name: "Focus & Deep Work Flow",
      description: "Ambient, lo-fi and minimalist instrumental beats for deep work.",
      public: true,
      collaborative: false,
      tracks: { total: 112 },
      images: [{ url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" }],
      external_urls: { spotify: "https://open.spotify.com" }
    },
    {
      id: "pl_3",
      name: "Favorite Anthems 2026",
      description: "My personal heavy-rotation collection of the year.",
      public: false,
      collaborative: false,
      tracks: { total: 42 },
      images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" }],
      external_urls: { spotify: "https://open.spotify.com" }
    },
    {
      id: "pl_4",
      name: "Road Trip & Weekend Vibes",
      description: "Upbeat pop and indie anthems with friends.",
      public: true,
      collaborative: true,
      tracks: { total: 85 },
      images: [{ url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80" }],
      external_urls: { spotify: "https://open.spotify.com" }
    }
  ]
};

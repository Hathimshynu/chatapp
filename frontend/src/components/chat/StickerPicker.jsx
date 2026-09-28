import { useEffect, useRef, useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { Search } from 'lucide-react';

const apiKey = import.meta.env.VITE_GIPHY_KEY;
const gf = apiKey ? new GiphyFetch(apiKey) : null;

const CATEGORIES = [
  { id: 'trending', label: 'Trending', type: 'stickers' },
  { id: 'love', label: 'Love', type: 'stickers' },
  { id: 'funny', label: 'Funny', type: 'stickers' },
  { id: 'happy', label: 'Happy', type: 'stickers' },
  { id: 'sad', label: 'Sad', type: 'stickers' },
  { id: 'celebrate', label: 'Party', type: 'stickers' },
  { id: 'trending', label: 'GIFs', type: 'gifs' },
  { id: 'meme', label: 'Memes', type: 'gifs' }
];

export default function StickerPicker({ onSelect }) {
  const [active, setActive] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const debounce = useRef(null);

  useEffect(() => {
    if (!gf) return;
    let cancelled = false;
    const category = CATEGORIES[active];
    const options = { limit: 30, rating: 'pg-13', ...(category.type === 'stickers' ? { type: 'stickers' } : {}) };
    setLoading(true);
    const request = query
      ? gf.search(query, options)
      : category.id === 'trending'
        ? gf.trending(options)
        : gf.search(category.id, options);
    request
      .then(result => { if (!cancelled) setItems(result.data); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, query]);

  const onInput = (event) => {
    setInput(event.target.value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(event.target.value.trim()), 400);
  };

  if (!gf) {
    return (
      <div className="composer-panel sticker-panel">
        <p className="empty-hint">Stickers need a Giphy API key (VITE_GIPHY_KEY).</p>
      </div>
    );
  }

  return (
    <div className="composer-panel sticker-panel">
      <div className="sticker-search">
        <Search size={16} />
        <input value={input} onChange={onInput} placeholder={`Search ${CATEGORIES[active].type === 'gifs' ? 'GIFs' : 'stickers'}`} />
      </div>
      <div className="sticker-tabs">
        {CATEGORIES.map((category, i) => (
          <button
            key={`${category.id}-${category.type}`}
            type="button"
            className={`chip${active === i ? ' is-active' : ''}`}
            onClick={() => { setActive(i); setInput(''); setQuery(''); }}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="sticker-grid">
        {loading && items.length === 0 && Array.from({ length: 12 }).map((_, i) => <span key={i} className="sticker-skeleton" />)}
        {!loading && items.length === 0 && <p className="empty-hint">No results</p>}
        {items.map(gif => (
          <button
            key={gif.id}
            type="button"
            className="sticker-item"
            onClick={() => {
              const image = gif.images?.fixed_height || gif.images?.downsized;
              onSelect({ url: image?.url, width: Number(image?.width) || 0, height: Number(image?.height) || 0 });
            }}
          >
            <img src={gif.images?.fixed_height_small?.url || gif.images?.downsized?.url} alt={gif.title} loading="lazy" />
          </button>
        ))}
      </div>
      <p className="giphy-attribution">Powered by GIPHY</p>
    </div>
  );
}

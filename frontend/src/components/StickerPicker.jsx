import { useState, useEffect, useRef } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';

const gf = new GiphyFetch(import.meta.env.VITE_GIPHY_KEY);

const STICKER_CATEGORIES = [
  { id: 'trending',  label: '🔥 Hot',    type: 'stickers' },
  { id: 'funny',     label: '😂 Funny',  type: 'stickers' },
  { id: 'love',      label: '❤️ Love',   type: 'stickers' },
  { id: 'sad',       label: '😢 Sad',    type: 'stickers' },
  { id: 'angry',     label: '😤 Angry',  type: 'stickers' },
  { id: 'celebrate', label: '🎉 Party',  type: 'stickers' },
  { id: 'trending',  label: '🎬 GIFs',   type: 'gifs'     },
  { id: 'meme',      label: '🐸 Memes',  type: 'gifs'     },
];

export default function StickerPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchTimeout = useRef(null);

  useEffect(() => {
    fetchItems();
  }, [activeCategory]);

  useEffect(() => {
    if (search) fetchSearch();
    else        fetchItems();
  }, [search]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const cat = STICKER_CATEGORIES[activeCategory];
      let result;
      if (cat.type === 'stickers') {
        result = cat.id === 'trending'
          ? await gf.trending({ media_type: 'stickers', limit: 24 })
          : await gf.search(cat.id, { media_type: 'stickers', limit: 24 });
      } else {
        result = cat.id === 'trending'
          ? await gf.trending({ limit: 24 })
          : await gf.search(cat.id, { limit: 24 });
      }
      setItems(result.data);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const cat = STICKER_CATEGORIES[activeCategory];
      const result = cat.type === 'stickers'
        ? await gf.search(search, { media_type: 'stickers', limit: 24 })
        : await gf.search(search, { limit: 24 });
      setItems(result.data);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInput = (e) => {
    setSearchInput(e.target.value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(e.target.value);
    }, 500);
  };

  const handleSelect = (gif) => {
    const url = gif.images?.downsized?.url || gif.images?.fixed_height?.url;
    onSelect({ type: 'sticker', url, id: gif.id });
  };

  return (
    <div style={{
      position: 'absolute', bottom: '70px', left: '10px',
      width: '360px', maxHeight: '440px',
      background: 'white', borderRadius: '20px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column',
      zIndex: 100, overflow: 'hidden',
      border: '1px solid #e0e0e0',
      animation: 'popUp 0.2s ease'
    }}>
      <style>{`
        @keyframes popUp {
          from { transform: scale(0.85) translateY(20px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
        .sticker-grid::-webkit-scrollbar { width: 4px; }
        .sticker-grid::-webkit-scrollbar-thumb { background: #c8e6c9; border-radius: 4px; }
        .sticker-item { transition: transform 0.15s; }
        .sticker-item:hover { transform: scale(1.08); }
        .sticker-search::placeholder { color: #aaa; }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #128C7E, #075E54)',
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: '8px',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '20px', flexShrink: 0 }}>🎭</span>
        <input
          className="sticker-search"
          value={searchInput}
          onChange={handleSearchInput}
          placeholder="Search stickers & GIFs..."
          style={{
            flex: 1, padding: '8px 14px',
            borderRadius: '20px', border: 'none',
            background: 'white',
            color: '#111', fontSize: '13px', outline: 'none',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
          }}
        />
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none',
          color: 'white', width: '30px', height: '30px',
          borderRadius: '50%', cursor: 'pointer', fontSize: '15px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>✕</button>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex', overflowX: 'auto', gap: '6px',
        padding: '8px 10px', background: '#f8f9fa',
        borderBottom: '1px solid #eee', flexShrink: 0,
        scrollbarWidth: 'none'
      }}>
        <style>{`.cat-scroll::-webkit-scrollbar{display:none}`}</style>
        {STICKER_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            onClick={() => {
              setActiveCategory(i);
              setSearch('');
              setSearchInput('');
            }}
            style={{
              padding: '5px 12px', borderRadius: '16px', border: 'none',
              background: activeCategory === i ? '#128C7E' : '#eee',
              color: activeCategory === i ? 'white' : '#555',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
              flexShrink: 0
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sticker Grid */}
      <div
        className="sticker-grid"
        style={{
          flex: 1, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '4px', padding: '8px'
        }}
      >
        {loading ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '40px 0', gap: '10px'
          }}>
            <div style={{
              width: '30px', height: '30px',
              border: '3px solid #c8e6c9',
              borderTop: '3px solid #128C7E',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span style={{ color: '#aaa', fontSize: '13px' }}>Loading...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : items.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center', padding: '40px 0', color: '#aaa'
          }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
            <p style={{ margin: 0, fontSize: '13px' }}>No results found</p>
          </div>
        ) : (
          items.map(gif => (
            <div
              key={gif.id}
              className="sticker-item"
              onClick={() => handleSelect(gif)}
              style={{
                cursor: 'pointer', borderRadius: '10px',
                overflow: 'hidden', aspectRatio: '1',
                background: '#f5f5f5',
                border: '2px solid transparent',
                transition: 'border 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#128C7E'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <img
                src={
                  gif.images?.fixed_height_small?.url ||
                  gif.images?.downsized?.url
                }
                alt={gif.title}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', display: 'block'
                }}
                loading="lazy"
              />
            </div>
          ))
        )}
      </div>

      {/* Giphy attribution — required by Giphy ToS */}
      <div style={{
        padding: '6px', textAlign: 'center',
        background: '#f8f9fa', borderTop: '1px solid #eee',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '10px', color: '#bbb', fontWeight: 600, letterSpacing: '0.5px' }}>
          Powered by GIPHY
        </span>
      </div>
    </div>
  );
}
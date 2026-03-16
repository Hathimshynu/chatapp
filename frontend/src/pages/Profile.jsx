import { useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Profile({ onClose }) {
  const { user, setUser } = useAuth();
  const [name, setName]     = useState(user?.name || '');
  const [about, setAbout]   = useState(user?.status || 'Hey there! I am using ChatApp');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [preview, setPreview] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name cannot be empty');
    setLoading(true);
    try {
      const { data } = await axios.put('/api/users/profile', {
        name: name.trim(),
        status: about.trim(),
        avatar
      }, { headers: { Authorization: `Bearer ${user.token}` } });

      const updated = { ...user, name: data.name, status: data.status, avatar: data.avatar };
      setUser(updated);
      localStorage.setItem('chatUser', JSON.stringify(updated));
      toast.success('Profile updated! ✅');
      onClose();
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: '24px',
        width: '100%', maxWidth: '420px', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        animation: 'popUp 0.25s ease'
      }} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes popUp { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }`}</style>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #128C7E, #075E54)',
          padding: '24px 20px', textAlign: 'center', position: 'relative'
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: '14px', right: '14px',
            background: 'rgba(255,255,255,0.2)', border: 'none',
            color: 'white', width: '32px', height: '32px',
            borderRadius: '50%', cursor: 'pointer', fontSize: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>✕</button>

          <h2 style={{ color: 'white', margin: '0 0 20px', fontSize: '20px', fontWeight: 800 }}>
            Edit Profile
          </h2>

          {/* Avatar */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              overflow: 'hidden', border: '4px solid rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer'
            }} onClick={() => fileRef.current?.click()}>
              {preview ? (
                <img src={preview} alt="avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '42px', color: 'white', fontWeight: 800 }}>
                  {user?.name?.[0]?.toUpperCase()}
                </span>
              )}
            </div>

            {/* Camera button */}
            <button onClick={() => fileRef.current?.click()} style={{
              position: 'absolute', bottom: '2px', right: '2px',
              width: '32px', height: '32px', borderRadius: '50%',
              background: '#25D366', border: '3px solid white',
              cursor: 'pointer', fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white'
            }}>📷</button>

            <input
              ref={fileRef} type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />
          </div>

          <p style={{
            color: 'rgba(255,255,255,0.75)', fontSize: '12px',
            margin: '10px 0 0'
          }}>
            Tap photo to change
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '24px 24px 20px' }}>

          {/* Name */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{
              display: 'block', fontSize: '12px', fontWeight: 700,
              color: '#128C7E', marginBottom: '8px',
              textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              Your Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={50}
              placeholder="Enter your name"
              style={{
                width: '100%', padding: '13px 16px',
                borderRadius: '14px', border: '2px solid #e0e0e0',
                fontSize: '15px', outline: 'none', color: '#111',
                boxSizing: 'border-box', transition: 'border 0.2s'
              }}
              onFocus={e => e.target.style.border = '2px solid #128C7E'}
              onBlur={e => e.target.style.border = '2px solid #e0e0e0'}
            />
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#bbb', marginTop: '4px' }}>
              {name.length}/50
            </div>
          </div>

          {/* About */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block', fontSize: '12px', fontWeight: 700,
              color: '#128C7E', marginBottom: '8px',
              textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              About
            </label>
            <textarea
              value={about}
              onChange={e => setAbout(e.target.value)}
              maxLength={139}
              rows={3}
              placeholder="Write something about yourself..."
              style={{
                width: '100%', padding: '13px 16px',
                borderRadius: '14px', border: '2px solid #e0e0e0',
                fontSize: '14px', outline: 'none', color: '#111',
                resize: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box', lineHeight: 1.5
              }}
              onFocus={e => e.target.style.border = '2px solid #128C7E'}
              onBlur={e => e.target.style.border = '2px solid #e0e0e0'}
            />
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#bbb', marginTop: '4px' }}>
              {about.length}/139
            </div>
          </div>

          {/* Save button */}
          <button onClick={handleSave} disabled={loading} style={{
            width: '100%', padding: '15px',
            background: loading ? '#ccc' : 'linear-gradient(135deg, #128C7E, #075E54)',
            color: 'white', border: 'none', borderRadius: '14px',
            fontSize: '16px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(18,140,126,0.4)',
            transition: 'all 0.2s'
          }}>
            {loading ? '⏳ Saving...' : '✅ Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
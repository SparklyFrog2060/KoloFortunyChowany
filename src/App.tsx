import React, { useState, useEffect } from 'react';
import { 
  onSnapshot, 
  doc, 
  setDoc, 
  collection, 
  getDocs, 
  deleteDoc, 
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  User as UserIcon, 
  Lock, 
  Settings, 
  Users, 
  Sparkles, 
  Play, 
  RotateCcw, 
  Volume2, 
  LogOut, 
  Check, 
  Plus, 
  Trash2, 
  UserCheck, 
  Search, 
  Eye, 
  EyeOff, 
  Compass,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { auth, db } from './firebase';
import { Player, GameSettings, HistoryEntry } from './types';
import { Wheel } from './components/Wheel';
import { playStartSound, playFanfareSound } from './utils/audio';

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Hidden setting state
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);

  // Custom Alert / Confirm states for Iframe compatibility
  const [customAlert, setCustomAlert] = useState<{ message: string; title?: string } | null>(null);
  const [customConfirm, setCustomConfirm] = useState<{ message: string; title?: string; onConfirm: () => void } | null>(null);

  const showAlert = (message: string, title = 'Informacja') => {
    setCustomAlert({ message, title });
  };

  const showConfirm = (message: string, onConfirm: () => void, title = 'Potwierdzenie') => {
    setCustomConfirm({ message, title, onConfirm });
  };

  // Players & Game State
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameSettings>({
    seekerPool: [],
    activePlayers: [],
    seeker: null,
    drawnPlayers: [],
    gameInProgress: false,
    lastDrawTime: null,
    pairs: [],
    currentLeader: null
  });

  // Local state for adding players
  const [newPlayerName, setNewPlayerName] = useState('');
  
  // Local state for checking attendance
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});

  // Spin state
  const [spinning, setSpinning] = useState(false);
  const [wheelTargetIndex, setWheelTargetIndex] = useState<number | null>(null);
  const [currentSpinType, setCurrentSpinType] = useState<'seeker' | 'leader' | 'partner' | null>(null);
  const [spinResultText, setSpinResultText] = useState<string | null>(null);

  // Selected player for pool configurations (for the "pula osób jaką ta osoba akceptuje" feature)
  const [selectedConfigPlayerId, setSelectedConfigPlayerId] = useState<string>('');

  // Watch Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Extract username from fake email, Google display name, or general email
        const rawEmail = currentUser.email || '';
        let name = 'Użytkownik';
        if (rawEmail.endsWith('@chowany.local')) {
          name = rawEmail.split('@')[0];
        } else if (currentUser.displayName) {
          name = currentUser.displayName;
        } else if (rawEmail) {
          name = rawEmail.split('@')[0];
        }
        setUsername(name);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch players list real-time
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, 'players'), (snapshot) => {
      const fetchedPlayers: Player[] = [];
      snapshot.forEach((doc) => {
        fetchedPlayers.push({ id: doc.id, ...doc.data() } as Player);
      });
      setPlayers(fetchedPlayers);
      
      // Sync attendance list locally if it's empty
      setAttendance((prev) => {
        const next = { ...prev };
        fetchedPlayers.forEach((p) => {
          if (next[p.name] === undefined) {
            next[p.name] = true; // default present
          }
        });
        return next;
      });
    });

    return unsubscribe;
  }, [user]);

  // Fetch / Sync Game settings real-time
  useEffect(() => {
    if (!user) return;

    const gameDocRef = doc(db, 'games', 'current');
    const unsubscribe = onSnapshot(gameDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setGameState({
          seekerPool: data.seekerPool || [],
          activePlayers: data.activePlayers || [],
          seeker: data.seeker || null,
          drawnPlayers: data.drawnPlayers || [],
          gameInProgress: data.gameInProgress || false,
          lastDrawTime: data.lastDrawTime || null,
          pairs: data.pairs || [],
          currentLeader: data.currentLeader || null,
        });

        // Sync local attendance dictionary with firebase activePlayers when game is not in progress
        if (!data.gameInProgress && data.activePlayers) {
          const newAttendance: Record<string, boolean> = {};
          data.activePlayers.forEach((name: string) => {
            newAttendance[name] = true;
          });
          // For any players not in activePlayers, mark as false
          players.forEach((p) => {
            if (!newAttendance[p.name]) {
              newAttendance[p.name] = false;
            }
          });
        }

        // Handle Real-time Sync of Spin trigger!
        if (data.currentSpin) {
          const spin = data.currentSpin;
          // Only trigger if we aren't already spinning or if the spin is new
          setWheelTargetIndex(spin.targetIndex);
          setCurrentSpinType(spin.type);
          setSpinning(true);
          setSpinResultText(null);
        } else {
          setSpinning(false);
          setWheelTargetIndex(null);
        }
      } else {
        // Initialize central game state document
        setDoc(gameDocRef, {
          seekerPool: [],
          activePlayers: [],
          seeker: null,
          drawnPlayers: [],
          gameInProgress: false,
          lastDrawTime: null,
          currentSpin: null,
          pairs: [],
          currentLeader: null
        });
      }
    });

    return unsubscribe;
  }, [user, players.length]);

  // Logo clicking secret menu detector
  const handleLogoClick = () => {
    setLogoClicks((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setShowSecretMenu(!showSecretMenu);
        playStartSound();
        return 0;
      }
      return next;
    });
  };

  // Auth: Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    if (!registerUsername || !registerPassword) {
      setAuthError('Wypełnij wszystkie pola!');
      return;
    }
    if (registerPassword.length < 6) {
      setAuthError('Hasło musi mieć co najmniej 6 znaków!');
      return;
    }

    const cleanUsername = registerUsername.trim().toLowerCase();
    setAuthLoading(true);

    try {
      // Check if username is taken
      const usernameDocRef = doc(db, 'usernames', cleanUsername);
      const usernameDoc = await getDoc(usernameDocRef);

      if (usernameDoc.exists()) {
        setAuthError('Ta nazwa użytkownika jest już zajęta!');
        setAuthLoading(false);
        return;
      }

      // Create firebase auth user with fake email
      const fakeEmail = `${cleanUsername}@chowany.local`;
      const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, registerPassword);
      
      // Save username map
      await setDoc(usernameDocRef, {
        uid: userCredential.user.uid,
        username: registerUsername,
        createdAt: Date.now()
      });

      setAuthSuccess('Konto utworzone pomyślnie! Logowanie...');
      setTimeout(() => {
        setAuthSuccess('');
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Wystąpił błąd podczas rejestracji.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Auth: Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    if (!loginUsername || !loginPassword) {
      setAuthError('Wypełnij wszystkie pola!');
      return;
    }

    const cleanUsername = loginUsername.trim().toLowerCase();
    setAuthLoading(true);

    try {
      const fakeEmail = `${cleanUsername}@chowany.local`;
      await signInWithEmailAndPassword(auth, fakeEmail, loginPassword);
      setAuthSuccess('Zalogowano pomyślnie!');
    } catch (err: any) {
      console.error(err);
      setAuthError('Błędna nazwa użytkownika lub hasło.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Auth: Google Sign-In
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setAuthSuccess('Zalogowano pomyślnie przez Google!');
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Wystąpił błąd podczas logowania przez Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Auth: Logout
  const handleLogout = async () => {
    await signOut(auth);
    setShowSecretMenu(false);
  };

  // Add new player to database
  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const trimmedName = newPlayerName.trim();
    
    // Check if player already exists
    if (players.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      showAlert('Taki gracz już istnieje!', 'Błąd');
      return;
    }

    const id = trimmedName.toLowerCase().replace(/\s+/g, '-');
    const newPlayer: Omit<Player, 'id'> = {
      name: trimmedName,
      acceptedPool: [], // accepts everyone by default (empty means no limits/everyone)
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'players', id), newPlayer);
      setNewPlayerName('');
      
      // Automatically add to Seeker Pool
      const updatedSeekerPool = [...gameState.seekerPool, trimmedName];
      await updateDoc(doc(db, 'games', 'current'), {
        seekerPool: updatedSeekerPool
      });
    } catch (err) {
      console.error('Error adding player:', err);
    }
  };

  // Delete player
  const handleDeletePlayer = async (playerId: string, playerName: string) => {
    showConfirm(`Czy na pewno chcesz usunąć gracza ${playerName}?`, async () => {
      try {
        await deleteDoc(doc(db, 'players', playerId));
        
        // Remove from seeker pool
        const updatedSeekerPool = gameState.seekerPool.filter((name) => name !== playerName);
        await updateDoc(doc(db, 'games', 'current'), {
          seekerPool: updatedSeekerPool
        });

        if (selectedConfigPlayerId === playerId) {
          setSelectedConfigPlayerId('');
        }
      } catch (err) {
        console.error('Error deleting player:', err);
      }
    }, 'Usuń gracza');
  };

  // Toggle player eligibility for seeker
  const toggleSeekerPoolEligibility = async (playerName: string) => {
    let updatedPool = [...gameState.seekerPool];
    if (updatedPool.includes(playerName)) {
      updatedPool = updatedPool.filter((name) => name !== playerName);
    } else {
      updatedPool.push(playerName);
    }

    try {
      await updateDoc(doc(db, 'games', 'current'), {
        seekerPool: updatedPool
      });
    } catch (err) {
      console.error('Error updating seeker pool:', err);
    }
  };

  // Toggle acceptance of another player for a specific player
  const toggleAcceptedPlayer = async (targetPlayerName: string) => {
    if (!selectedConfigPlayerId) return;
    const activePlayer = players.find((p) => p.id === selectedConfigPlayerId);
    if (!activePlayer) return;

    let updatedAcceptedPool = [...(activePlayer.acceptedPool || [])];
    if (updatedAcceptedPool.includes(targetPlayerName)) {
      updatedAcceptedPool = updatedAcceptedPool.filter((name) => name !== targetPlayerName);
    } else {
      updatedAcceptedPool.push(targetPlayerName);
    }

    try {
      await updateDoc(doc(db, 'players', selectedConfigPlayerId), {
        acceptedPool: updatedAcceptedPool
      });
    } catch (err) {
      console.error('Error updating player accepted pool:', err);
    }
  };

  // Handle Attendance Change locally
  const handleAttendanceChange = (playerName: string) => {
    setAttendance((prev) => ({
      ...prev,
      [playerName]: !prev[playerName]
    }));
  };

  // Helper to get unmatched players who are not the seeker and not in any drawn pair/trio
  const getRemainingPlayers = () => {
    return gameState.activePlayers.filter((name) => 
      name !== gameState.seeker && !gameState.drawnPlayers.includes(name)
    );
  };

  // Helper to get eligible partners for a specific leader
  const getEligiblePartners = (leaderName: string) => {
    const remaining = getRemainingPlayers().filter((name) => name !== leaderName);
    if (remaining.length === 0) return [];
    
    // Look up leader's acceptedPool (A's pool)
    const leaderPlayerObj = players.find((p) => p.name === leaderName);
    const leaderAccepted = leaderPlayerObj?.acceptedPool || [];

    // Layered fallback strategy:
    // 1. Mutual match: A accepts B AND B accepts A (or has no restrictions)
    const mutualMatches = remaining.filter((pName) => {
      const pObj = players.find((p) => p.name === pName);
      const pAccepted = pObj?.acceptedPool || [];
      
      const leaderAcceptsP = leaderAccepted.length === 0 || leaderAccepted.includes(pName);
      const pAcceptsLeader = pAccepted.length === 0 || pAccepted.includes(leaderName);
      
      return leaderAcceptsP && pAcceptsLeader;
    });

    if (mutualMatches.length > 0) {
      return mutualMatches;
    }

    // 2. Leader accepts partner: A accepts B (even if B does not accept A)
    if (leaderAccepted.length > 0) {
      const filtered = remaining.filter((name) => leaderAccepted.includes(name));
      if (filtered.length > 0) {
        return filtered;
      }
    }

    // 3. Partner accepts leader: B accepts A (even if A does not accept B)
    const partnerAcceptsLeader = remaining.filter((pName) => {
      const pObj = players.find((p) => p.name === pName);
      const pAccepted = pObj?.acceptedPool || [];
      return pAccepted.includes(leaderName);
    });

    if (partnerAcceptsLeader.length > 0) {
      return partnerAcceptsLeader;
    }

    // 4. Complete fallback: combine pools and allow any remaining player so they always have a partner
    return remaining;
  };

  // Confirm attendance & start game
  const handleConfirmAttendance = async () => {
    const presentPlayers = Object.entries(attendance)
      .filter(([_, present]) => present)
      .map(([name]) => name);

    if (presentPlayers.length < 2) {
       showAlert('Do gry potrzeba co najmniej 2 obecnych graczy!', 'Błąd');
       return;
     }

    try {
      await updateDoc(doc(db, 'games', 'current'), {
        activePlayers: presentPlayers,
        gameInProgress: true,
        seeker: null,
        drawnPlayers: [],
        pairs: [],
        currentLeader: null,
        currentSpin: null
      });
    } catch (err) {
      console.error('Error starting game:', err);
    }
  };

  // Trigger spin for Seeker (Szukający)
  const triggerSeekerSpin = async () => {
    if (spinning || gameState.activePlayers.length === 0) return;

    playStartSound();

    // Determine the secret subset of players who are eligible to be drawn as Seeker.
    // Must be both checked in (activePlayers) AND in the secret seekerPool.
    let eligibleSeekers = gameState.activePlayers.filter((name) => 
      gameState.seekerPool.includes(name)
    );

    // Fallback if no checked-in players are in the seekerPool
    if (eligibleSeekers.length === 0) {
      eligibleSeekers = [...gameState.activePlayers];
    }

    // Pick random target from eligible pool
    const selectedSeeker = eligibleSeekers[Math.floor(Math.random() * eligibleSeekers.length)];
    
    // Find its index in the eligible subset (which is shown on the wheel during spin)
    const targetIndex = eligibleSeekers.indexOf(selectedSeeker);

    try {
      await updateDoc(doc(db, 'games', 'current'), {
        currentSpin: {
          targetIndex,
          type: 'seeker',
          timestamp: Date.now()
        }
      });
    } catch (err) {
      console.error('Error writing spin state:', err);
    }
  };

  // Trigger spin for the Leader of the Pair (Lider pary)
  const triggerLeaderSpin = async () => {
    if (spinning || !gameState.seeker) return;

    const remaining = getRemainingPlayers();
    if (remaining.length === 0) {
      showAlert('Wszyscy obecni gracze zostali już sparowani!');
      return;
    }

    playStartSound();

    // Pick random target from remaining
    const selectedLeader = remaining[Math.floor(Math.random() * remaining.length)];

    // Find its index in the remaining subset (which the wheel will display)
    const targetIndex = remaining.indexOf(selectedLeader);

    try {
      await updateDoc(doc(db, 'games', 'current'), {
        currentSpin: {
          targetIndex,
          type: 'leader',
          timestamp: Date.now()
        }
      });
    } catch (err) {
      console.error('Error writing leader spin state:', err);
    }
  };

  // Trigger spin for the Partner of the current Leader
  const triggerPartnerSpin = async () => {
    if (spinning || !gameState.currentLeader) return;

    const eligible = getEligiblePartners(gameState.currentLeader);
    if (eligible.length === 0) {
      showAlert('Brak dostępnych partnerów dla tego gracza!');
      return;
    }

    playStartSound();

    // Pick random target from eligible
    const selectedPartner = eligible[Math.floor(Math.random() * eligible.length)];

    // Find its index in the eligible subset (which the wheel will display)
    const targetIndex = eligible.indexOf(selectedPartner);

    try {
      await updateDoc(doc(db, 'games', 'current'), {
        currentSpin: {
          targetIndex,
          type: 'partner',
          timestamp: Date.now()
        }
      });
    } catch (err) {
      console.error('Error writing partner spin state:', err);
    }
  };

  // Spin complete callback
  const handleSpinComplete = async (winnerName: string) => {
    setSpinning(false);
    playFanfareSound();
    
    // Trigger canvas confetti explosion
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });

    if (currentSpinType === 'seeker') {
      setSpinResultText(`Szukającym zostaje: ${winnerName}! 🔍`);
      // Update firebase
      try {
        await updateDoc(doc(db, 'games', 'current'), {
          seeker: winnerName,
          currentSpin: null,
          lastDrawTime: Date.now()
        });
      } catch (err) {
        console.error(err);
      }
    } else if (currentSpinType === 'leader') {
      setSpinResultText(`Wybrana osoba do pary: ${winnerName}! Now, losuj partnera... 👥`);
      // Update firebase
      try {
        await updateDoc(doc(db, 'games', 'current'), {
          currentLeader: winnerName,
          currentSpin: null,
          lastDrawTime: Date.now()
        });
      } catch (err) {
        console.error(err);
      }
    } else if (currentSpinType === 'partner') {
      const leader = gameState.currentLeader;
      if (!leader) return;

      // Calculate remaining hiders excluding leader and the winner
      const remainingExcludingLeader = getRemainingPlayers().filter(name => name !== leader);
      
      let finalGroup = [leader, winnerName];
      let updatedDrawn = [...gameState.drawnPlayers, leader, winnerName];
      let groupText = `Para: ${leader} i ${winnerName}! 👥`;

      // If exactly 1 player remains unmatched, merge them into a Trio of 3!
      const leftOver = remainingExcludingLeader.filter(name => name !== winnerName);
      if (leftOver.length === 1) {
        const lastPerson = leftOver[0];
        finalGroup.push(lastPerson);
        updatedDrawn.push(lastPerson);
        groupText = `Trójka: ${leader}, ${winnerName} i ${lastPerson}! 👥✨`;
      }

      setSpinResultText(`Wylosowano parę! ${groupText}`);

      try {
        const joinedGroupStr = finalGroup.join(', ');
        const nextPairs = [...(gameState.pairs || []), joinedGroupStr];

        await updateDoc(doc(db, 'games', 'current'), {
          pairs: nextPairs,
          drawnPlayers: updatedDrawn,
          currentLeader: null,
          currentSpin: null,
          lastDrawTime: Date.now()
        });
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Helper to handle Solo confirmation if no eligible partners exist
  const handleConfirmSolo = async () => {
    const leader = gameState.currentLeader;
    if (!leader) return;
    try {
      const nextPairs = [...(gameState.pairs || []), `${leader} (Solo)`];
      await updateDoc(doc(db, 'games', 'current'), {
        pairs: nextPairs,
        drawnPlayers: [...gameState.drawnPlayers, leader],
        currentLeader: null,
        currentSpin: null,
        lastDrawTime: Date.now()
      });
      setSpinResultText(`Gracz ${leader} gra Solo!`);
    } catch (err) {
      console.error(err);
    }
  };

  // Reset or end the game session
  const handleResetGame = async () => {
    showConfirm('Czy na pewno chcesz zresetować całą rozgrywkę?', async () => {
      try {
        setSpinResultText(null);
        await updateDoc(doc(db, 'games', 'current'), {
          gameInProgress: false,
          seeker: null,
          drawnPlayers: [],
          pairs: [],
          currentLeader: null,
          currentSpin: null
        });
      } catch (err) {
        console.error(err);
      }
    }, 'Zresetuj grę');
  };

  // Selected config player object
  const selectedConfigPlayer = players.find((p) => p.id === selectedConfigPlayerId);

  // Authentication screen
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f0e26] text-white flex flex-col justify-center items-center p-4 selection:bg-amber-400 selection:text-indigo-950 font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#0f0e26] to-[#080718] pointer-events-none" />
        
        <div className="w-full max-w-md relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex p-3 bg-amber-400 rounded-full shadow-lg shadow-amber-500/20 mb-4 animate-pulse">
              <Sparkles className="w-8 h-8 text-indigo-950" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-2 justify-center">
              Chowany Fortuny
            </h1>
            <span className="text-xs text-indigo-300 font-bold tracking-widest uppercase block mt-1">
              Live Game Engine
            </span>
          </div>

          {/* Form Card */}
          <div className="bg-indigo-900/30 border-2 border-indigo-500/20 rounded-[32px] p-6 shadow-2xl backdrop-blur-xl">
            {/* Tabs */}
            <div className="flex border-b border-indigo-500/20 pb-4 mb-6">
              <button
                id="login-tab-btn"
                onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 text-center font-black uppercase tracking-wider text-xs transition ${
                  authMode === 'login' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-indigo-300 hover:text-white'
                }`}
              >
                Logowanie
              </button>
              <button
                id="register-tab-btn"
                onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 text-center font-black uppercase tracking-wider text-xs transition ${
                  authMode === 'register' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-indigo-300 hover:text-white'
                }`}
              >
                Nowe konto
              </button>
            </div>

            {authError && (
              <div id="auth-error-msg" className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div id="auth-success-msg" className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-300">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{authSuccess}</span>
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">
                    Nazwa użytkownika
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-indigo-400" />
                    <input
                      id="login-username-input"
                      type="text"
                      placeholder="Wpisz swój login"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-indigo-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">
                    Hasło
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-indigo-400" />
                    <input
                      id="login-password-input"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-indigo-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                    />
                  </div>
                </div>

                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 active:shadow-[0_2px_0_#b27404] text-indigo-950 text-xs font-black py-3.5 rounded-full shadow-[0_4px_0_#b27404] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none cursor-pointer mt-2"
                >
                  {authLoading ? 'Logowanie...' : 'Zaloguj się'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">
                    Nowa nazwa użytkownika
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-indigo-400" />
                    <input
                      id="register-username-input"
                      type="text"
                      placeholder="Np. mikolaj12"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-indigo-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">
                    Hasło
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-indigo-400" />
                    <input
                      id="register-password-input"
                      type="password"
                      placeholder="Min. 6 znaków"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-indigo-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                    />
                  </div>
                </div>

                <button
                  id="register-submit-btn"
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 active:shadow-[0_2px_0_#b27404] text-indigo-950 text-xs font-black py-3.5 rounded-full shadow-[0_4px_0_#b27404] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none cursor-pointer mt-2"
                >
                  {authLoading ? 'Zakładanie konta...' : 'Zarejestruj konto'}
                </button>
              </form>
            )}

            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-indigo-500/20"></div>
              <span className="flex-shrink mx-4 text-[10px] text-indigo-400 font-bold uppercase tracking-widest">LUB</span>
              <div className="flex-grow border-t border-indigo-500/20"></div>
            </div>

            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full bg-white/10 hover:bg-white/15 active:translate-y-0.5 border border-indigo-500/30 text-white text-xs font-bold py-3.5 rounded-full transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Zaloguj się przez Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get active wheel items dynamically depending on the current drawing step
  const getWheelItems = () => {
    if (spinning) {
      if (currentSpinType === 'seeker') {
        const eligibleSeekers = gameState.activePlayers.filter((name) => 
          gameState.seekerPool.includes(name)
        );
        return eligibleSeekers.length > 0 ? eligibleSeekers : gameState.activePlayers;
      }
      if (currentSpinType === 'leader') {
        return getRemainingPlayers();
      }
      if (currentSpinType === 'partner' && gameState.currentLeader) {
        return getEligiblePartners(gameState.currentLeader);
      }
    }

    // When idle during game in progress
    if (gameState.gameInProgress) {
      if (gameState.currentLeader) {
        // Show eligible partners
        const eligible = getEligiblePartners(gameState.currentLeader);
        return eligible.length > 0 ? eligible : ['Brak partnerów'];
      }
      // Otherwise show remaining unmatched players
      const remaining = getRemainingPlayers();
      return remaining.length > 0 ? remaining : ['Wszyscy sparowani'];
    }

    // Default before game start
    return players.length > 0 ? players.map((p) => p.name) : ['Dodaj graczy'];
  };

  // Active Main Game screen
  return (
    <div className="min-h-screen bg-[#0f0e26] text-white flex flex-col select-none font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#0f0e26] to-[#080718] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 h-20 bg-indigo-900/50 border-b border-indigo-400/20 px-4 sm:px-8 flex items-center justify-between">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div 
            id="app-header-title"
            onClick={handleLogoClick}
            className="flex items-center gap-4 cursor-pointer hover:opacity-90 transition active:scale-95 group"
            title="Kliknij 3 razy aby otworzyć tajne menu konfiguracji"
          >
            <div className="w-12 h-12 bg-amber-400 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.4)]">
              <Compass className="w-7 h-7 text-indigo-950 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter uppercase italic text-white flex items-center gap-2 leading-none">
                Chowany Fortuny
                <span className="text-[9px] bg-amber-400 text-indigo-950 font-black not-italic px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                  Live
                </span>
              </h1>
              <span className="text-[10px] text-indigo-300 font-bold tracking-widest uppercase block mt-0.5">Live Game Engine</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 bg-indigo-850 px-4 py-1.5 rounded-2xl border border-indigo-400/30">
              <div className="w-6 h-6 bg-pink-500 rounded-full border border-white flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm">
                {username.substring(0, 2)}
              </div>
              <span className="font-bold text-xs text-white">Gracz: {username}</span>
            </div>

            <button
              id="logout-btn"
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-indigo-200 hover:text-white transition active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Wyloguj</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: List/Status */}
        <div className="lg:col-span-5 space-y-6">

          {/* Secret Menu Section */}
          {showSecretMenu && (
            <div id="secret-settings-panel" className="bg-gradient-to-b from-amber-950/20 to-slate-950/40 border-2 border-amber-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden animate-fade-in">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400 animate-spin-slow" />
                  <h2 className="text-base font-bold text-amber-400 uppercase tracking-wide">
                    Tajny Panel Sterowania (Pule)
                  </h2>
                </div>
                <button
                  id="close-secret-btn"
                  onClick={() => setShowSecretMenu(false)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Ukryj
                </button>
              </div>

              {/* Seeker Pool Configuration */}
              <div className="mb-5 bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Pula osób do wylosowania jako szukający
                </h3>
                <p className="text-[10px] text-slate-500 mb-3">
                  Wybierz, kto MOŻE zostać wylosowany jako szukający (niewidoczne na kole)
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  {players.length === 0 ? (
                    <span className="text-xs text-slate-600 col-span-2">Brak graczy w bazie.</span>
                  ) : (
                    players.map((p) => {
                      const isEligible = gameState.seekerPool.includes(p.name);
                      return (
                        <button
                          key={p.id}
                          id={`toggle-seeker-pool-${p.id}`}
                          onClick={() => toggleSeekerPoolEligibility(p.name)}
                          className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-left text-xs border transition ${
                            isEligible
                              ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
                              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                            isEligible ? 'bg-amber-500 border-amber-400 text-slate-950' : 'border-slate-600'
                          }`}>
                            {isEligible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <span className="truncate">{p.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Acceptance Pools Configuration */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Konfiguracja puli akceptacji gracza
                </h3>
                <p className="text-[10px] text-slate-500 mb-3">
                  Wybierz osobę, a następnie zaznacz pulę innych osób, z którymi ta osoba zgadza się grać
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Kto konfiguruje?</label>
                    <select
                      id="select-config-player"
                      value={selectedConfigPlayerId}
                      onChange={(e) => setSelectedConfigPlayerId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                    >
                      <option value="">-- Wybierz gracza --</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedConfigPlayer && (
                    <div>
                      <label className="block text-[10px] text-amber-400/80 mb-1.5">
                        Pula osób akceptowanych przez <strong>{selectedConfigPlayer.name}</strong>:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1 bg-slate-950/60 p-2 rounded-lg border border-slate-900">
                        {players
                          .filter((p) => p.id !== selectedConfigPlayerId)
                          .map((p) => {
                            const isAccepted = (selectedConfigPlayer.acceptedPool || []).includes(p.name);
                            return (
                              <button
                                key={p.id}
                                id={`toggle-accepted-${p.id}`}
                                onClick={() => toggleAcceptedPlayer(p.name)}
                                className={`flex items-center gap-2 py-1 px-2 rounded-md text-left text-[11px] border transition ${
                                  isAccepted
                                    ? 'bg-amber-950/20 border-amber-600/40 text-amber-300'
                                    : 'bg-slate-900/40 border-slate-850 text-slate-500 hover:border-slate-800'
                                }`}
                              >
                                <div className={`w-3 h-3 rounded flex items-center justify-center border ${
                                  isAccepted ? 'bg-amber-500 border-amber-400 text-slate-950' : 'border-slate-700'
                                }`}>
                                  {isAccepted && <Check className="w-2 h-2 stroke-[3]" />}
                                </div>
                                <span className="truncate">{p.name}</span>
                              </button>
                            );
                          })}
                      </div>
                      <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">
                        * Pusta pula oznacza brak limitów (akceptuje wszystkich). Podczas parowania, partner dla tego gracza będzie losowany tylko z tej puli osób.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Core Panel: State Dependent */}
          {!gameState.gameInProgress ? (
            /* STAGE 1: Attendance Checklist & All Registered List */
            <>
              <div className="bg-indigo-900/30 rounded-[32px] p-6 border-2 border-indigo-500/20 shadow-2xl backdrop-blur-md animate-fade-in">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-500/20">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-black text-white uppercase tracking-wider italic">
                      Lista Obecności
                    </h2>
                  </div>
                  <span className="text-xs text-indigo-300 font-bold bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-500/20">
                    Etap 1: Przygotowanie
                  </span>
                </div>

                <p className="text-xs text-indigo-200 mb-4 leading-relaxed">
                  Zaznacz odpowiednie checkboxy dla osób, które są fizycznie obecne i biorą udział w dzisiejszej grze w chowanego przed finalnym zatwierdzeniem.
                </p>

                {/* Attendance List */}
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 mb-5">
                  {players.length === 0 ? (
                    <div className="text-center py-8 bg-indigo-950/40 border border-dashed border-indigo-500/20 rounded-2xl">
                      <p className="text-xs text-indigo-300">Brak graczy w bazie.</p>
                      <p className="text-[10px] text-indigo-400 mt-2 font-bold">
                        Dodaj pierwszych graczy w panelu "Baza Osób" poniżej!
                      </p>
                    </div>
                  ) : (
                    players.map((p) => {
                      const isChecked = !!attendance[p.name];
                      return (
                        <div
                          key={p.id}
                          id={`attendance-row-${p.id}`}
                          onClick={() => handleAttendanceChange(p.name)}
                          className={`flex items-center justify-between p-3 rounded-2xl border transition duration-200 cursor-pointer select-none ${
                            isChecked
                              ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
                              : 'bg-white/5 border-white/10 text-indigo-200 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all ${
                              isChecked ? 'bg-amber-400 border-amber-300 text-indigo-950 shadow-md shadow-amber-500/20' : 'border-indigo-400/30'
                            }`}>
                              {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span className="text-sm font-bold">{p.name}</span>
                          </div>

                          {/* Secret status indicator to show if they are eligible for seeker or have accepted pools */}
                          <div className="flex items-center gap-1.5">
                            {gameState.seekerPool.includes(p.name) && (
                              <span className="text-[9px] bg-amber-400/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-400/20 font-bold" title="Może szukać">
                                SZUKAJĄCY
                              </span>
                            )}
                            {p.acceptedPool && p.acceptedPool.length > 0 && (
                              <span className="text-[9px] bg-pink-500/10 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/20 font-bold" title="Ma własną pulę">
                                PULA
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Start game button */}
                <button
                  id="start-draw-stage-btn"
                  onClick={handleConfirmAttendance}
                  disabled={players.length === 0}
                  className="w-full bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 active:shadow-[0_2px_0_#b27404] text-indigo-950 text-xs font-black py-3.5 rounded-full shadow-[0_4px_0_#b27404] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Zatwierdź obecność i rozpocznij losowanie
                </button>
              </div>

              {/* Baza Osób Section (poza menu tajnym!) */}
              <div id="players-database-panel" className="bg-indigo-900/30 rounded-[32px] p-6 border-2 border-indigo-500/20 shadow-2xl backdrop-blur-md animate-fade-in">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-500/20">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-black text-white uppercase tracking-wider italic">
                      Baza Osób
                    </h2>
                  </div>
                  <span className="text-[10px] text-indigo-300 font-bold bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-500/20">
                    Baza graczy ({players.length})
                  </span>
                </div>

                <p className="text-xs text-indigo-200 mb-4 leading-relaxed">
                  Dodaj nowe osoby do bazy lub usuń istniejące. Te osoby pojawią się na liście obecności powyżej.
                </p>

                {/* Form to add a player */}
                <form onSubmit={handleAddPlayer} className="flex gap-2 mb-5">
                  <input
                    id="new-player-input"
                    type="text"
                    placeholder="Wpisz imię/nick gracza"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    className="flex-1 bg-slate-900/60 border border-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition"
                  />
                  <button
                    id="add-player-btn"
                    type="submit"
                    className="bg-amber-400 hover:bg-amber-300 text-indigo-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1 transition active:scale-95 shadow-[0_2px_0_#b27404]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Dodaj
                  </button>
                </form>

                {/* Database List */}
                <div className="max-h-40 overflow-y-auto divide-y divide-indigo-500/10 pr-1">
                  {players.length === 0 ? (
                    <span className="text-xs text-indigo-300 italic block py-2">Brak zarejestrowanych osób w bazie.</span>
                  ) : (
                    players.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2">
                        <span className="text-xs text-indigo-100 font-bold">{p.name}</span>
                        <button
                          id={`delete-player-${p.id}`}
                          onClick={() => handleDeletePlayer(p.id, p.name)}
                          className="text-indigo-400 hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-white/5"
                          title="Usuń z bazy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            /* STAGE 2: Game in Progress Drawing Controls */
            <div className="bg-indigo-900/30 rounded-[32px] p-6 border-2 border-indigo-500/20 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-500/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                  <h2 className="text-base font-black text-white uppercase tracking-wider italic">
                    Losowanie Par / Trójek
                  </h2>
                </div>
                <span className="text-xs text-amber-400 font-bold bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-500/20">
                  Etap 2: W toku
                </span>
              </div>

              {/* Seeker State box */}
              <div className="mb-4 bg-indigo-950/60 border border-indigo-500/20 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                    Szukający (Szuka innych)
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span className="text-lg font-black text-amber-400 uppercase italic">
                      {gameState.seeker ? gameState.seeker : 'Niewylosowany'}
                    </span>
                  </div>
                </div>

                {!gameState.seeker && (
                  <button
                    id="spin-seeker-btn"
                    onClick={triggerSeekerSpin}
                    disabled={spinning}
                    className="bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 text-indigo-950 font-black text-xs py-2 px-3.5 rounded-full shadow-[0_3px_0_#b27404] transition-all active:shadow-none disabled:opacity-50 cursor-pointer"
                  >
                    Losuj Szukającego!
                  </button>
                )}
              </div>

              {/* Pairs Match box */}
              {gameState.seeker && (
                <div className="space-y-4 mb-4">
                  {/* Current Active Draw State */}
                  <div className="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl p-4">
                    <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-2">
                      Sterowanie losowaniem par
                    </h3>

                    {getRemainingPlayers().length === 0 && !gameState.currentLeader ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-amber-300 font-extrabold uppercase">Wszystkie pary wylosowane! 🎉</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {/* Leader drawing stage or waiting for partner */}
                        {!gameState.currentLeader ? (
                          <div>
                            <p className="text-xs text-indigo-200 mb-2">
                              {getRemainingPlayers().length === 3 && gameState.activePlayers.filter(n => n !== gameState.seeker).length % 2 !== 0 ? (
                                <span className="text-pink-400 font-bold block mb-1">Ostatnie 3 osoby utworzą trójkę! Losuj lidera grupy.</span>
                              ) : (
                                "Wylosuj pierwszą osobę, dla której dobierzemy partnera."
                              )}
                            </p>
                            <button
                              id="spin-leader-btn"
                              onClick={triggerLeaderSpin}
                              disabled={spinning}
                              className="w-full bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 text-indigo-950 font-black text-xs py-2.5 rounded-xl shadow-[0_3px_0_#b27404] transition-all disabled:opacity-50 cursor-pointer"
                            >
                              Losuj osobę do sparowania
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-indigo-200 mb-2">
                              Dobieranie partnera dla: <span className="text-amber-300 font-black uppercase italic">{gameState.currentLeader}</span>
                            </p>
                            <div className="flex gap-2">
                              {getEligiblePartners(gameState.currentLeader).length > 0 ? (
                                <button
                                  id="spin-partner-btn"
                                  onClick={triggerPartnerSpin}
                                  disabled={spinning}
                                  className="flex-1 bg-pink-500 hover:bg-pink-400 active:translate-y-0.5 text-white font-black text-xs py-2.5 rounded-xl shadow-[0_3px_0_#be185d] transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  Losuj partnera dla {gameState.currentLeader}
                                </button>
                              ) : (
                                <button
                                  id="confirm-solo-btn"
                                  onClick={handleConfirmSolo}
                                  disabled={spinning}
                                  className="flex-1 bg-indigo-500 hover:bg-indigo-400 active:translate-y-0.5 text-white font-black text-xs py-2.5 rounded-xl shadow-[0_3px_0_#4338ca] transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  Zatwierdź jako Solo (brak wolnych z puli)
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Matched Pairs List */}
                  <div className="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl p-4">
                    <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-2.5">
                      Utworzone grupy / pary
                    </h3>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {(!gameState.pairs || gameState.pairs.length === 0) ? (
                        <p className="text-xs text-indigo-300 italic py-2">Brak utworzonych par.</p>
                      ) : (
                        gameState.pairs.map((pairStr, index) => {
                          const isTrio = pairStr.split(',').length >= 3;
                          const isSolo = pairStr.includes('Solo');
                          return (
                            <div key={pairStr} className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl border border-white/10 animate-fade-in">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-400 font-extrabold">#{index + 1}</span>
                                <span className="text-xs text-white font-bold">{pairStr}</span>
                              </div>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                                isTrio 
                                  ? 'bg-pink-500/20 border-pink-500/30 text-pink-300' 
                                  : isSolo 
                                  ? 'bg-slate-500/20 border-slate-500/30 text-slate-300' 
                                  : 'bg-amber-400/10 border-amber-400/20 text-amber-300'
                              }`}>
                                {isTrio ? 'Trójka' : isSolo ? 'Solo' : 'Para'}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Remaining Free Players List */}
                  {getRemainingPlayers().length > 0 && (
                    <div className="bg-indigo-950/40 border border-indigo-500/10 rounded-xl p-3">
                      <h4 className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-1.5">
                        Zostali do sparowania ({getRemainingPlayers().length}):
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {getRemainingPlayers().map(name => (
                          <span key={name} className="px-2 py-0.5 bg-indigo-900/40 border border-indigo-500/20 rounded-md text-[10px] text-indigo-100 font-semibold">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action reset controls */}
              <div className="mt-5 pt-4 border-t border-indigo-500/20 flex gap-3">
                <button
                  id="reset-game-btn"
                  onClick={handleResetGame}
                  className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 border-2 border-rose-500/30 text-rose-300 hover:text-white text-xs font-bold py-3 rounded-full transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Koniec rozgrywki / Reset
                </button>
              </div>
            </div>
          )}

          {/* Dynamic presence list indicator */}
          <div className="bg-indigo-900/15 border border-indigo-500/20 rounded-[24px] p-5 text-xs text-indigo-200 shadow-lg">
            <h4 className="font-extrabold text-white mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Users className="w-4 h-4 text-amber-400 animate-pulse" />
              Obecni uczestnicy w tej sesji:
            </h4>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {gameState.activePlayers.length === 0 ? (
                <span className="text-indigo-300/60 italic">Brak zatwierdzonych obecnych.</span>
              ) : (
                gameState.activePlayers.map((name) => (
                  <span
                    key={name}
                    className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border transition duration-200 ${
                      name === gameState.seeker
                        ? 'bg-amber-400/20 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]'
                        : gameState.drawnPlayers.includes(name)
                        ? 'bg-pink-500/20 border-pink-500/50 text-pink-300'
                        : 'bg-white/5 border-white/10 text-indigo-200'
                    }`}
                  >
                    {name}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Wheel of Fortune Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-6">
          
          {/* Wheel Box */}
          <div className="relative w-full max-w-lg flex flex-col items-center">
            
            {/* Overlay banner to indicate rigged parameters if seeker has one, or secret menu is active */}
            {showSecretMenu && (
              <div className="absolute top-4 left-4 z-10 bg-amber-400/10 border border-amber-400/30 rounded-xl py-1 px-2.5 text-[9px] font-black text-amber-300 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Sekretny Tryb Rigged aktywny
              </div>
            )}

            {/* Results Banner Overlay */}
            {spinResultText && (
              <div id="spin-result-banner" className="w-full text-center bg-gradient-to-r from-amber-400/10 via-indigo-900/40 to-pink-500/10 border-2 border-amber-400/40 py-4 px-6 rounded-3xl shadow-2xl shadow-amber-500/5 mb-6 animate-fade-in relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-shine" />
                <p className="text-base sm:text-lg font-black text-white flex items-center justify-center gap-2 uppercase tracking-wide italic">
                  <Sparkles className="w-5 h-5 text-amber-400 animate-spin-slow" />
                  {spinResultText}
                </p>
              </div>
            )}

            {/* Wheel representation with dynamically scoped items based on current draw step */}
            <Wheel
              items={getWheelItems()}
              spinning={spinning}
              targetIndex={wheelTargetIndex}
              onSpinComplete={handleSpinComplete}
            />

            {/* Spinning status indicator */}
            {spinning && (
              <div className="mt-4 flex flex-col items-center gap-1.5 bg-indigo-950/80 border border-amber-400/30 py-2.5 px-6 rounded-full shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-black text-amber-300 uppercase tracking-widest">
                    Losowanie {currentSpinType === 'seeker' ? 'Szukającego' : currentSpinType === 'leader' ? 'Osoby do Pary' : 'Partnera dla pary'}...
                  </span>
                </div>
                <p className="text-[10px] text-indigo-300/60">Trwa synchronizacja w czasie rzeczywistym u wszystkich</p>
              </div>
            )}

            {/* Instruction manual for the game */}
            <div className="w-full bg-indigo-900/15 border border-indigo-500/20 rounded-[24px] p-5 mt-8 text-xs text-indigo-200 leading-relaxed shadow-lg">
              <h4 className="font-black text-white text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-amber-400" />
                Jak działa Losowanie Par?
              </h4>
              <ol className="list-decimal pl-5 space-y-1.5 text-indigo-200">
                <li>Dodaj osoby w module <strong className="text-amber-400">Baza Osób</strong> na dole lewej kolumny.</li>
                <li>Zaznacz obecnych graczy na liście obecności przed startem gry.</li>
                <li>Zatwierdź obecność. Koło automatycznie załaduje obecnych graczy.</li>
                <li>Najpierw wylosuj <strong className="text-amber-400">Szukającego</strong>, który nie bierze udziału w parowaniu.</li>
                <li>Następnie paruj pozostałych graczy: najpierw losujesz osobę do pary, a potem jej partnera na podstawie konfiguracji akceptacji z tajnego menu (kliknij 3 razy nagłówek strony aby je otworzyć).</li>
                <li>Jeżeli liczba osób niebędących szukającym jest <strong className="text-pink-400 font-bold">nieparzysta</strong>, ostatnia wylosowana grupa automatycznie utworzy <strong className="text-pink-400 font-bold">Trójkę</strong>!</li>
              </ol>
            </div>
          </div>
        </div>
      </main>

      {/* Custom Alert Modal */}
      {customAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#1e1c44] border border-indigo-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center transform transition duration-300 scale-100">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-500/10 mb-4 border border-amber-500/20 text-amber-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-extrabold text-white mb-2 uppercase tracking-wide">
              {customAlert.title || 'Informacja'}
            </h3>
            <p className="text-xs text-indigo-200 mb-6 leading-relaxed">
              {customAlert.message}
            </p>
            <button
              onClick={() => setCustomAlert(null)}
              className="w-full bg-indigo-500 hover:bg-indigo-400 active:translate-y-0.5 text-white font-extrabold text-xs py-3 rounded-xl transition duration-150 cursor-pointer shadow-[0_3px_0_#4338ca] active:shadow-none"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {customConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#1e1c44] border border-indigo-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center transform transition duration-300 scale-100">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-rose-500/10 mb-4 border border-rose-500/20 text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-extrabold text-white mb-2 uppercase tracking-wide">
              {customConfirm.title || 'Potwierdzenie'}
            </h3>
            <p className="text-xs text-indigo-200 mb-6 leading-relaxed">
              {customConfirm.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCustomConfirm(null)}
                className="flex-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 font-extrabold text-xs py-3 rounded-xl border border-indigo-500/20 transition duration-150 cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
                className="flex-1 bg-rose-500 hover:bg-rose-400 active:translate-y-0.5 text-white font-extrabold text-xs py-3 rounded-xl transition duration-150 cursor-pointer shadow-[0_3px_0_#be185d] active:shadow-none"
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

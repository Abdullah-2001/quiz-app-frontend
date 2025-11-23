import React, { useEffect, useState, useRef } from 'react';

const BACKEND = 'http://localhost:4000';

export default function App() {

  const [quiz, setQuiz] = useState(null);
  const [session, setSession] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [answers, setAnswers] = useState({});
  const syncTimerRef = useRef(null);
  const tickRef = useRef(null);
  const sessionIdRef = useRef(localStorage.getItem('quiz_session_id'));
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState(null);

  useEffect(() => {
    // fetch quiz meta
    fetch(BACKEND + '/quiz').then(r => r.json()).then(data => setQuiz(data)).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    // start or continue session
    startOrContinue();
    return () => {
      clearInterval(tickRef.current);
      clearInterval(syncTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz]);

  function startOrContinue() {
    const payload = sessionIdRef.current ? { sessionId: sessionIdRef.current } : {};
    console.log(payload);
    fetch(BACKEND + '/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(r => r.json())
      .then(s => {
        sessionIdRef.current = s.sessionId;
        localStorage.setItem('quiz_session_id', s.sessionId);
        setSession(s);
        const rem = s.remaining !== undefined ? s.remaining : (s.durationSeconds - (s.elapsed || 0));
        setRemaining(rem);
        setStatus(s.finished ? 'finished' : 'running');
        // start ticking
        startTicking();
        // periodic sync to backend to correct drift every 10s
        if (syncTimerRef.current) clearInterval(syncTimerRef.current);
        syncTimerRef.current = setInterval(syncWithServer, 10000);
      })
      .catch(err => console.error(err));
  }

  function syncWithServer() {
    const id = sessionIdRef.current;
    if (!id) return;
    fetch(BACKEND + '/session/' + id).then(r => r.json()).then(s => {
      setSession(s);
      setStatus(s.finished ? 'finished' : 'running');
      setRemaining(s.remaining);
      if (s.finished) handleFinish(false);
    }).catch(err => console.error(err));
  }

  function startTicking() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev === null || prev === undefined) return prev;
        if (prev <= 1) {
          // time up
          clearInterval(tickRef.current);
          handleFinish(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function selectAnswer(qid, idx) {
    if (status === 'finished') return;
    setAnswers(a => ({ ...a, [qid]: idx }));
    // optimistic save
    fetch(BACKEND + '/answer',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, questionId: qid, choiceIndex: idx })
      }
    ).catch((err) => console.error(err));
  }

  function handleFinish(auto = false) {
    setStatus('finished');
    // call backend finish to compute score
    fetch(BACKEND + '/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionIdRef.current }) })
      .then(r => r.json())
      .then(res => {
        setResult(res);
      }).catch(err => console.error(err));
  }

  if (!quiz || !session) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Simple Quiz</h1>
      <div style={{ marginBottom: 12 }}>
        Duration: {Math.floor(quiz.durationSeconds / 60)}:{String(quiz.durationSeconds % 60).padStart(2, '0')}
        <span style={{ marginLeft: 20 }}>Remaining: {Math.floor((remaining || 0) / 60)}:{String((remaining || 0) % 60).padStart(2, '0')}</span>
        <span style={{ marginLeft: 20 }}>Status: {status}</span>
      </div>

      {status !== 'finished' && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => syncWithServer()}>Sync now</button>
          <button onClick={() => { localStorage.removeItem('quiz_session_id'); sessionIdRef.current = null; window.location.reload(); }} style={{ marginLeft: 8 }}>Reset and start new</button>
        </div>
      )}

      {quiz.questions.map(q => (
        <div key={q.id} style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>{q.id}. {q.q}</div>
          <div style={{ marginTop: 8 }}>
            {q.choices.map((c, i) => (
              <label key={i} style={{ display: 'block', marginBottom: 6, opacity: status === 'finished' ? 0.6 : 1 }}>
                <input
                  type="radio"
                  name={`q_${q.id}`}
                  checked={answers[q.id] === i}
                  onChange={() => selectAnswer(q.id, i)}
                  disabled={status === 'finished'}
                />{' '}{c}
              </label>
            ))}
          </div>
        </div>
      ))}

      {status !== 'finished' && (
        <div>
          <button onClick={() => handleFinish(false)}>Submit now</button>
        </div>
      )}

      {status === 'finished' && result && (
        <div style={{ marginTop: 16, padding: 12, background: '#f7f7f7', borderRadius: 8 }}>
          <h2>Result</h2>
          <p>Score: {result.score} / {result.total}</p>
          <pre>{JSON.stringify(result.answers, null, 2)}</pre>
          <div style={{ marginTop: 10 }}>
            <button onClick={() => { localStorage.removeItem('quiz_session_id'); sessionIdRef.current = null; window.location.reload(); }}>Start New Quiz</button>
          </div>
        </div>
      )}

    </div>
  );
}

// -------------------------
// End of document
// -------------------------
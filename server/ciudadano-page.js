// Página pública para que los CIVILES llamen al 911.
// La sirve el propio servidor de radio en /911 (Render o servidor local).
// Al enviar el formulario, la llamada aparece AL INSTANTE en el Despacho
// de todos los CAD conectados.
//
// Nota: este archivo es un texto (HTML) — no se ejecuta en Node.

module.exports = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>📞 Llamar al 911 — La Realidad RP</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
  body {
    margin: 0; min-height: 100vh; padding: 16px;
    display: flex; align-items: center; justify-content: center;
    background: #070b12 radial-gradient(1000px 500px at 50% -10%, #12203a 0%, #070b12 60%);
    color: #e6edf7;
  }
  .card {
    width: 100%; max-width: 480px; background: #0d1523;
    border: 1px solid #1c2940; border-radius: 16px; padding: 22px;
    box-shadow: 0 20px 60px rgba(0,0,0,.55);
  }
  h1 { margin: 0 0 2px; font-size: 24px; color: #f87171; }
  .sub { margin: 0 0 12px; color: #8ea0b8; font-size: 13px; }
  .warn {
    background: #3b1c1c; border: 1px solid #7f1d1d; color: #fecaca;
    font-size: 12.5px; padding: 8px 10px; border-radius: 10px; margin: 0 0 14px; line-height: 1.45;
  }
  label { display: block; font-size: 12.5px; color: #9fb0c7; margin: 12px 0 4px; font-weight: 600; }
  input, textarea {
    width: 100%; background: #131e30; color: #e6edf7; border: 1px solid #24344e;
    border-radius: 9px; padding: 10px 12px; font-size: 14.5px; outline: none;
  }
  input:focus, textarea:focus { border-color: #3b82f6; }
  textarea { resize: vertical; min-height: 74px; }
  .types { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; margin-top: 4px; }
  .type { margin: 0; }
  .type input { display: none; }
  .type span {
    display: block; text-align: center; background: #131e30; border: 1px solid #24344e;
    border-radius: 9px; padding: 9px 6px; font-size: 13.5px; color: #cfdcee; cursor: pointer;
    user-select: none;
  }
  .type input:checked + span {
    border-color: #ef4444; background: #2a1214; color: #fecaca; font-weight: 700;
  }
  button {
    width: 100%; margin-top: 16px; padding: 14px; font-size: 16px; font-weight: 800;
    letter-spacing: .3px; color: #fff;
    background: linear-gradient(180deg, #dc2626, #b91c1c);
    border: 1px solid #ef4444; border-radius: 11px; cursor: pointer;
  }
  button:hover { filter: brightness(1.08); }
  button:disabled { opacity: .6; cursor: wait; }
  .result { margin-top: 12px; font-size: 14px; line-height: 1.5; }
  .result.ok { color: #4ade80; }
  .result.err { color: #f87171; }
</style>
</head>
<body>
<main class="card">
  <h1>📞 Llamada al 911</h1>
  <p class="sub">La Realidad RP · Los Angeles (ER:LC)</p>
  <p class="warn">⚠️ Esto es para <b>roleplay</b> dentro del juego ER:LC. <b>No</b> es una línea de emergencia real.</p>

  <form id="f">
    <label>Tipo de emergencia</label>
    <div class="types">
      <label class="type"><input type="radio" name="kind" value="POLICE" checked /><span>🚓 Policía</span></label>
      <label class="type"><input type="radio" name="kind" value="MEDICAL" /><span>🚑 Médica</span></label>
      <label class="type"><input type="radio" name="kind" value="FIRE" /><span>🚒 Incendio</span></label>
      <label class="type"><input type="radio" name="kind" value="TRAFFIC" /><span>🛣️ Tránsito</span></label>
      <label class="type"><input type="radio" name="kind" value="OTHER" /><span>❓ Otra</span></label>
    </div>

    <label for="name">Tu nombre (personaje)</label>
    <input id="name" maxlength="60" placeholder="Ej: Marta Gómez" />

    <label for="location">¿Dónde estás?</label>
    <input id="location" maxlength="120" placeholder="Ej: Calle 7, frente al hospital" />

    <label for="description">¿Qué está pasando?</label>
    <textarea id="description" maxlength="500" placeholder="Contá brevemente lo que pasa…"></textarea>

    <button id="send" type="submit">📞 LLAMAR AL 911</button>
  </form>
  <div id="result" class="result"></div>
</main>

<script>
(function () {
  var form = document.getElementById('f');
  var btn = document.getElementById('send');
  var result = document.getElementById('result');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    var checked = document.querySelector('input[name="kind"]:checked');
    var payload = {
      kind: checked ? checked.value : 'OTHER',
      name: document.getElementById('name').value,
      location: document.getElementById('location').value,
      description: document.getElementById('description').value
    };

    fetch('/911', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (d) { return { status: r.status, data: d || {} }; });
      })
      .then(function (res) {
        if (res.status === 200 && res.data.ok) {
          result.className = 'result ok';
          result.innerHTML = '✅ <b>Llamada recibida.</b><br>Unidades en camino. Tu número de caso: <b>' + res.data.id + '</b>';
          form.reset();
        } else {
          result.className = 'result err';
          result.textContent = '⚠️ ' + (res.data.error || 'No se pudo enviar la llamada.');
        }
        btn.disabled = false;
        btn.textContent = '📞 LLAMAR AL 911';
      })
      .catch(function () {
        result.className = 'result err';
        result.textContent = '⚠️ Sin conexión con el CAD. Probá de nuevo en unos segundos.';
        btn.disabled = false;
        btn.textContent = '📞 LLAMAR AL 911';
      });
  });
})();
</script>
</body>
</html>`;

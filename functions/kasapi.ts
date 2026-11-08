import { Pool } from 'pg';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
const SESSION_HOURS = 12;

function json(data: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {status, headers: {'content-type':'application/json; charset=utf-8', ...headers}});
}
function cors(req: Request): Record<string,string> {
  const origin = req.headers.get('origin') || '';
  const allowed = (process.env.APP_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const migrationFromFile=origin==='null' && new URL(req.url).pathname==='/api/migrations/local-storage';
  if ((!origin || (!allowed.includes(origin) && !localDevelopmentOrigin)) && !migrationFromFile) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,PATCH,DELETE,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'vary': 'Origin'
  };
}
function validPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 240 && path.split('/').length >= 1 &&
    path.split('/').length <= 4 && path.split('/').every(p => /^[A-Za-z0-9_-]{1,80}$/.test(p));
}
function validDocumentPath(path: unknown): path is string {
  return validPath(path) && path.split('/').length >= 2;
}
function classIdFromPath(path: string) { return path.startsWith('classes/') ? path.split('/')[1] : null; }
function stripCredentialFields(path: string, data: Record<string, any>) {
  const copy = {...data};
  if (path.split('/').length === 2 && path.startsWith('classes/')) {
    delete copy.salt; delete copy.passHash; delete copy.adminPassword;
  }
  return copy;
}
function scryptHash(password: string, salt = randomBytes(16).toString('hex')) {
  return {salt, hash:scryptSync(password, salt, 64).toString('hex'), scheme:'scrypt'};
}
function verifyPassword(password: string, row: any) {
  if (row.hash_scheme === 'legacy-sha256') {
    const legacy = createHash('sha256').update(row.salt + ':' + password, 'utf8').digest('hex');
    const a = Buffer.from(legacy); const b = Buffer.from(row.password_hash);
    return a.length === b.length && timingSafeEqual(a,b);
  }
  if(row.hash_scheme==='legacy-fallback'){
    let h1=2166136261,h2=5381;
    for(let i=0;i<(row.salt+':'+password).length;i++){const c=(row.salt+':'+password).charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2*33,1)^c;}
    return ('f'+(h1>>>0).toString(16)+(h2>>>0).toString(16))===row.password_hash;
  }
  const actual = scryptSync(password, row.salt, 64);
  const expected = Buffer.from(row.password_hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function saveCredential(client: any, kind: string, subjectId: string, password: string) {
  if (typeof password !== 'string' || password.length < 4 || password.length > 200) throw new Error('Password harus berisi 4–200 karakter.');
  const c = scryptHash(password);
  await client.query(`INSERT INTO kaskelas.app_credentials(kind,subject_id,salt,password_hash,hash_scheme)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(kind,subject_id) DO UPDATE SET salt=EXCLUDED.salt,password_hash=EXCLUDED.password_hash,hash_scheme=EXCLUDED.hash_scheme,updated_at=now()`,
    [kind,subjectId,c.salt,c.hash,c.scheme]);
}
async function sessionFor(req: Request) {
  const bearer = req.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!token) return null;
  const hash = createHash('sha256').update(token).digest('hex');
  const result = await pool.query('SELECT role,class_id FROM kaskelas.app_sessions WHERE token_hash=$1 AND expires_at>now()', [hash]);
  return result.rows[0] || null;
}
async function newSession(role: 'owner'|'admin', classId: string|null) {
  await pool.query('DELETE FROM kaskelas.app_sessions WHERE expires_at<now()');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await pool.query(`INSERT INTO kaskelas.app_sessions(token_hash,role,class_id,expires_at)
    VALUES($1,$2,$3,now()+($4 * interval '1 hour'))`, [tokenHash,role,classId,SESSION_HOURS]);
  return token;
}
async function login(kind: string, subjectId: string, password: string) {
  const result = await pool.query('SELECT * FROM kaskelas.app_credentials WHERE kind=$1 AND subject_id=$2', [kind,subjectId]);
  const row = result.rows[0];
  if (!row || !verifyPassword(password,row)) return null;
  if (String(row.hash_scheme).startsWith('legacy-')) await saveCredential(pool,kind,subjectId,password);
  return newSession(kind === 'owner' ? 'owner' : 'admin', kind === 'owner' ? null : subjectId);
}
function loginScope(kind: string, subjectId: string, req: Request){
  const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim();
  return createHash('sha256').update(kind+':'+subjectId+':'+ip).digest('hex');
}
async function blocked(scope: string){
  const r=await pool.query('SELECT blocked_until FROM kaskelas.app_login_limits WHERE scope=$1',[scope]);
  return !!(r.rows[0]?.blocked_until && new Date(r.rows[0].blocked_until).getTime()>Date.now());
}
async function failedLogin(scope: string){
  await pool.query(`INSERT INTO kaskelas.app_login_limits(scope,attempts,window_started_at,blocked_until)
    VALUES($1,1,now(),NULL) ON CONFLICT(scope) DO UPDATE SET
    attempts=CASE WHEN kaskelas.app_login_limits.window_started_at < now()-interval '15 minutes' THEN 1 ELSE kaskelas.app_login_limits.attempts+1 END,
    window_started_at=CASE WHEN kaskelas.app_login_limits.window_started_at < now()-interval '15 minutes' THEN now() ELSE kaskelas.app_login_limits.window_started_at END,
    blocked_until=CASE WHEN (CASE WHEN kaskelas.app_login_limits.window_started_at < now()-interval '15 minutes' THEN 1 ELSE kaskelas.app_login_limits.attempts+1 END)>=8 THEN now()+interval '15 minutes' ELSE kaskelas.app_login_limits.blocked_until END`,[scope]);
}
function mayWrite(session: any, path: string) {
  if (!session) return false;
  if (session.role === 'owner') return true;
  const parts = path.split('/');
  if (parts.length===2 && parts[0]==='classes' && parts[1]===session.class_id) return true; // PATCH below is restricted to derived summary fields.
  return parts.length >= 3 && parts[0] === 'classes' && parts[1] === session.class_id &&
    ['students','pay','notes'].includes(parts[2]);
}
function jsonData(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Isi dokumen harus berupa objek.');
  return value;
}

async function handle(req: Request) {
  const url = new URL(req.url), method = req.method.toUpperCase(), headers = cors(req);
  if (method === 'OPTIONS') return new Response(null,{status:204,headers});
  try {
    const body = method === 'GET' || method === 'DELETE' ? {} : await req.json().catch(()=>({}));
    if (url.pathname === '/api/health' && method === 'GET') return json({ok:true,service:'KasKelas Neon API'},200,headers);

    if (url.pathname === '/api/auth/owner/setup' && method === 'POST') {
      const configured = process.env.OWNER_SETUP_TOKEN || '';
      const provided = String((body as any).setupToken || '');
      if (!configured || !provided || configured !== provided) return json({error:'Kunci setup Owner tidak cocok.'},403,headers);
      const exists = await pool.query("SELECT 1 FROM kaskelas.app_credentials WHERE kind='owner' AND subject_id='owner'");
      if (exists.rowCount) return json({error:'Owner sudah disiapkan. Gunakan login Owner.'},409,headers);
      const ownerPassword=String((body as any).password||'');
      if(ownerPassword.length<10) return json({error:'Password Owner minimal 10 karakter.'},400,headers);
      await saveCredential(pool,'owner','owner',ownerPassword);
      return json({token:await newSession('owner',null),role:'owner'},200,headers);
    }
    if (url.pathname === '/api/auth/owner/login' && method === 'POST') {
      const scope=loginScope('owner','owner',req); if(await blocked(scope))return json({error:'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'},429,headers);
      const token = await login('owner','owner',String((body as any).password||''));
      if(!token)await failedLogin(scope);else await pool.query('DELETE FROM kaskelas.app_login_limits WHERE scope=$1',[scope]);
      return token ? json({token,role:'owner'},200,headers) : json({error:'Password Owner salah.'},401,headers);
    }
    if (url.pathname === '/api/auth/admin/login' && method === 'POST') {
      const classId = String((body as any).classId||'');
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(classId)) return json({error:'Kelas tidak valid.'},400,headers);
      const scope=loginScope('class_admin',classId,req); if(await blocked(scope))return json({error:'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'},429,headers);
      const token = await login('class_admin',classId,String((body as any).password||''));
      if(!token)await failedLogin(scope);else await pool.query('DELETE FROM kaskelas.app_login_limits WHERE scope=$1',[scope]);
      return token ? json({token,role:'admin',classId},200,headers) : json({error:'Password Admin salah.'},401,headers);
    }
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      const bearer=req.headers.get('authorization')||''; const raw=bearer.startsWith('Bearer ')?bearer.slice(7):'';
      if(raw) await pool.query('DELETE FROM kaskelas.app_sessions WHERE token_hash=$1',[createHash('sha256').update(raw).digest('hex')]);
      return json({ok:true},200,headers);
    }

    if (url.pathname === '/api/migrations/local-storage' && method === 'POST') {
      const session = await sessionFor(req);
      if (!session || session.role !== 'owner') return json({error:'Login Owner diperlukan untuk memindahkan data.'},403,headers);
      const legacy = (body as any).data;
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return json({error:'Data migrasi tidak valid.'},400,headers);
      const client=await pool.connect(); let count=0;
      try {
        await client.query('BEGIN');
        for (const [path,value] of Object.entries(legacy)) {
          if(!validPath(path) || !value || typeof value!=='object' || Array.isArray(value)) continue;
          const data={...(value as any)};
          if(path.startsWith('classes/') && path.split('/').length===2){
            const cid=classIdFromPath(path)!;
            if(data.passHash && data.salt){
              await client.query(`INSERT INTO kaskelas.app_credentials(kind,subject_id,salt,password_hash,hash_scheme) VALUES('class_admin',$1,$2,$3,$4)
                ON CONFLICT(kind,subject_id) DO NOTHING`,[cid,String(data.salt),String(data.passHash),String(data.passHash).length<64?'legacy-fallback':'legacy-sha256']);
            }
            delete data.salt; delete data.passHash; delete data.adminPassword;
          }
          await client.query(`INSERT INTO kaskelas.app_documents(path,data) VALUES($1,$2::jsonb)
            ON CONFLICT(path) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`,[path,JSON.stringify(data)]);
          count++;
        }
        await client.query('COMMIT');
      } catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return json({ok:true,documents:count},200,headers);
    }

    const session=await sessionFor(req);
    if (url.pathname === '/api/collection' && method === 'GET') {
      const path=url.searchParams.get('path')||''; if(!validPath(path)) return json({error:'Path koleksi tidak valid.'},400,headers);
      const result=await pool.query(`SELECT path,data FROM kaskelas.app_documents
        WHERE path LIKE $1 AND position('/' in substring(path from char_length($2)+2))=0 ORDER BY data->>'ord',path`,[path+'/%',path]);
      return json({docs:result.rows.map((r:any)=>({id:r.path.slice(path.length+1),data:stripCredentialFields(r.path,r.data)}))},200,headers);
    }
    if (url.pathname === '/api/document' && method === 'GET') {
      const path=url.searchParams.get('path')||''; if(!validDocumentPath(path)) return json({error:'Path dokumen tidak valid.'},400,headers);
      const result=await pool.query('SELECT data FROM kaskelas.app_documents WHERE path=$1',[path]);
      return json(result.rowCount?{exists:true,data:stripCredentialFields(path,result.rows[0].data)}:{exists:false,data:{}},200,headers);
    }
    if (url.pathname === '/api/document' && ['PUT','PATCH','DELETE'].includes(method)) {
      const path=method==='DELETE' ? (url.searchParams.get('path')||'') : String((body as any).path||'');
      if(!validDocumentPath(path)) return json({error:'Path dokumen tidak valid.'},400,headers);
      if(!mayWrite(session,path)) return json({error:'Login Owner/Admin diperlukan untuk mengubah data.'},403,headers);
      const rootClass=path.startsWith('classes/')&&path.split('/').length===2;
      if(rootClass && session.role==='admin' && (method!=='PATCH' || Object.keys((body as any).data||{}).some(k=>!['saldo','studentCount'].includes(k))))
        return json({error:'Admin hanya dapat memperbarui ringkasan otomatis kelas.'},403,headers);
      if(method==='DELETE'){
        const client=await pool.connect();
        try{await client.query('BEGIN');
          if(rootClass){await client.query('DELETE FROM kaskelas.app_documents WHERE path=$1 OR path LIKE $2',[path,path+'/%']);await client.query("DELETE FROM kaskelas.app_credentials WHERE kind='class_admin' AND subject_id=$1",[classIdFromPath(path)]);}
          else await client.query('DELETE FROM kaskelas.app_documents WHERE path=$1',[path]);
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
        return json({ok:true},200,headers);
      }
      let data=jsonData((body as any).data);
      if(method==='PATCH'){
        const prior=await pool.query('SELECT data FROM kaskelas.app_documents WHERE path=$1',[path]);
        if(!prior.rowCount) return json({error:'Dokumen tidak ditemukan.'},404,headers);
        data={...prior.rows[0].data,...data};
      }
      const client=await pool.connect();
      try{await client.query('BEGIN');
        if(rootClass){
          const cid=classIdFromPath(path)!;
          if(data.adminPassword){await saveCredential(client,'class_admin',cid,String(data.adminPassword));}
          else if(data.passHash&&data.salt){
            await client.query(`INSERT INTO kaskelas.app_credentials(kind,subject_id,salt,password_hash,hash_scheme) VALUES('class_admin',$1,$2,$3,$4)
              ON CONFLICT(kind,subject_id) DO NOTHING`,[cid,String(data.salt),String(data.passHash),String(data.passHash).length<64?'legacy-fallback':'legacy-sha256']);
          }
          delete data.adminPassword; delete data.salt; delete data.passHash;
        }
        await client.query(`INSERT INTO kaskelas.app_documents(path,data) VALUES($1,$2::jsonb)
          ON CONFLICT(path) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`,[path,JSON.stringify(data)]);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      return json({ok:true},200,headers);
    }
    return json({error:'Endpoint tidak ditemukan.'},404,headers);
  } catch(e:any) {
    console.error('KasKelas API error:',e);
    const message=e && e.message || 'Kesalahan server.';
    return json({error:message},400,headers);
  }
}

export default { fetch: handle };

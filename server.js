const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const moment = require('moment');

const app = express();
const PORT = 3847;
const DATA_FILE = path.join(__dirname, 'data', 'voting-data.json');

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return { sessions: {}, votes: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 首页 - 创建投票
app.get('/', (req, res) => {
  res.render('create');
});

// 创建投票
app.post('/create', (req, res) => {
  const { topic, duration_minutes, admin_id } = req.body;
  
  if (!topic || !admin_id) {
    return res.render('create', { error: '请填写投票议题和管理员昵称' });
  }
  
  const voteId = uuidv4().substring(0, 8);
  const adminId = Buffer.from(String(admin_id)).toString('base64').substring(0, 12);
  const deadline = moment().add(parseInt(duration_minutes) || 120, 'minutes').format('YYYY-MM-DD HH:mm:ss');
  
  const data = loadData();
  data.sessions[voteId] = {
    voteId,
    topic,
    adminId,
    deadline,
    createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
  };
  data.votes[voteId] = [];
  saveData(data);
  
  res.redirect(`/admin/${voteId}/${adminId}`);
});

// 投票页面
app.get('/vote/:voteId', (req, res) => {
  const { voteId } = req.params;
  const data = loadData();
  const session = data.sessions[voteId];
  
  if (!session) {
    return res.render('error', { message: '投票不存在' });
  }
  
  const isExpired = moment(session.deadline).isBefore(moment());
  
  res.render('vote', { session, isExpired, port: PORT });
});

// 提交投票
app.post('/api/vote', (req, res) => {
  const { voteId, openid, nickname, option, remark } = req.body;
  
  const data = loadData();
  const session = data.sessions[voteId];
  
  if (!session) {
    return res.json({ success: false, message: '投票不存在' });
  }
  
  if (moment(session.deadline).isBefore(moment())) {
    return res.json({ success: false, message: '投票已截止' });
  }
  
  // 检查是否已投票
  const existing = data.votes[voteId]?.find(v => v.openid === openid);
  if (existing) {
    return res.json({ success: false, message: '您已经投过票了' });
  }
  
  if (option === 'conditional' && (!remark || remark.trim() === '')) {
    return res.json({ success: false, message: '请填写有条件赞成的条件说明' });
  }
  
  if (!data.votes[voteId]) {
    data.votes[voteId] = [];
  }
  
  data.votes[voteId].push({
    openid,
    nickname,
    option,
    remark: remark || '',
    createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
  });
  
  saveData(data);
  res.json({ success: true, message: '投票成功' });
});

// 获取我的投票
app.get('/api/my-vote/:voteId/:openid', (req, res) => {
  const { voteId, openid } = req.params;
  const data = loadData();
  const vote = data.votes[voteId]?.find(v => v.openid === openid);
  
  if (vote) {
    res.json({ 
      voted: true, 
      option: vote.option, 
      remark: vote.remark,
      created_at: vote.createdAt
    });
  } else {
    res.json({ voted: false });
  }
});

// 主持人管理页面
app.get('/admin/:voteId/:adminId', (req, res) => {
  const { voteId, adminId } = req.params;
  
  const data = loadData();
  const session = data.sessions[voteId];
  
  if (!session) {
    return res.render('error', { message: '投票不存在' });
  }
  
  if (session.adminId !== adminId) {
    return res.render('error', { message: '无权限访问' });
  }
  
  const votes = data.votes[voteId] || [];
  
  const stats = {
    total: votes.length,
    approve: votes.filter(v => v.option === 'approve').length,
    reject: votes.filter(v => v.option === 'reject').length,
    conditional: votes.filter(v => v.option === 'conditional').length
  };
  
  res.render('admin', { session, votes, stats, port: PORT });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎉 投票服务已启动!`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`📱 手机访问: 在同一网络下用手机浏览器打开上述地址\n`);
});

module.exports = app;

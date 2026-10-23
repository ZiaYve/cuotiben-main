<script setup>
import { computed, onMounted, onUnmounted, ref, toRaw } from 'vue'
import { RouterLink } from 'vue-router'
import { ERROR_REASON_MAP, MASTERY_STATUS, MASTERY_STATUS_LIST } from '@/constants/enums'
import { subjects } from '@/mock/data'
import { deleteLocalMistake, listLocalMistakes, localImageUrl, saveLocalMistake } from '@/storage/mistakes'

const items = ref([])
const query = ref('')
const subjectFilter = ref('')
const statusFilter = ref('')
const loading = ref(true)
const error = ref('')
const statusError = ref('')
const expanded = ref(new Set())
const imageUrls = ref({})
const activeImage = ref(null)

const visibleItems = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return items.value.filter((item) => {
    if (subjectFilter.value && String(item.subjectId) !== String(subjectFilter.value)) return false
    if (statusFilter.value && item.masteryStatus !== statusFilter.value) return false
    if (!keyword) return true
    const fields = [item.title, item.questionText, item.answer, item.analysis, item.source, item.reasonNote, item.subjectName, item.knowledgePointName, ...(item.tags ?? [])]
    return fields.some((field) => String(field ?? '').toLocaleLowerCase().includes(keyword))
  })
})

async function loadItems() {
  loading.value = true
  error.value = ''
  Object.values(imageUrls.value).flatMap((urls) => [...urls.question, ...urls.answer]).forEach((url) => URL.revokeObjectURL(url))
  try {
    items.value = await listLocalMistakes()
    imageUrls.value = Object.fromEntries(items.value.map((item) => [item.id, {
      question: (item.images ?? []).map((image) => localImageUrl(image)),
      answer: (item.answerImages ?? []).map((image) => localImageUrl(image))
    }]))
  } catch {
    error.value = '无法读取本地错题记录，请检查浏览器是否允许网站使用本地存储。'
  } finally {
    loading.value = false
  }
}

function toggleExpanded(id) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

async function removeItem(item) {
  if (!window.confirm('确定删除这条错题记录吗？此操作无法撤销。')) return
  await deleteLocalMistake(item.id)
  await loadItems()
}

async function updateStatus(item, event) {
  const updated = { ...toRaw(item), masteryStatus: event.target.value }
  try {
    await saveLocalMistake(updated)
    items.value = items.value.map((current) => current.id === item.id ? updated : current)
    statusError.value = ''
  } catch {
    statusError.value = '状态保存失败，请重试。'
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function imageUrl(item, index) {
  return imageUrls.value[item.id]?.question[index]
}

function answerImageUrl(item, index) {
  return imageUrls.value[item.id]?.answer[index]
}

function openImage(url, name) {
  if (url) activeImage.value = { url, name }
}

function closeImage() {
  activeImage.value = null
}

function onKeydown(event) {
  if (event.key === 'Escape') closeImage()
}

onMounted(loadItems)
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  Object.values(imageUrls.value).flatMap((urls) => [...urls.question, ...urls.answer]).forEach((url) => URL.revokeObjectURL(url))
})
</script>

<template>
  <section class="container library-page">
    <div class="library-heading">
      <div><p class="eyebrow">MY COLLECTION</p><h1>我的错题库</h1><p>每一道记下来的错题，都是下一次做对的线索。</p></div>
      <RouterLink to="/library/new" class="btn btn--primary">＋ 录入错题</RouterLink>
    </div>

    <div class="library-toolbar card">
      <label class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input v-model="query" type="search" placeholder="搜索题目、答案、标签或来源" /></label>
      <select v-model="subjectFilter" aria-label="按学科筛选"><option value="">全部学科</option><option v-for="subject in subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option></select>
      <select v-model="statusFilter" aria-label="按复习状态筛选"><option value="">全部状态</option><option v-for="status in MASTERY_STATUS_LIST" :key="status.code" :value="status.code">{{ status.label }}</option></select>
      <span class="result-count">{{ visibleItems.length }} 条记录</span>
    </div>
    <p v-if="statusError" class="status-error" role="alert">{{ statusError }}</p>

    <div v-if="loading" class="empty-card card">正在读取你的错题记录…</div>
    <div v-else-if="error" class="empty-card card"><p>{{ error }}</p><button class="btn btn--ghost" @click="loadItems">重新加载</button></div>
    <div v-else-if="!items.length" class="empty-card card">
      <div class="empty-mark">错</div><h2>这里还没有错题</h2><p>把刚才做错的题记下来，之后可以随时回来复习。</p><RouterLink to="/library/new" class="btn btn--primary">录入第一道错题</RouterLink>
    </div>
    <div v-else-if="!visibleItems.length" class="empty-card card"><h2>没有找到匹配的错题</h2><p>换个关键词或筛选条件试试。</p><button class="btn btn--ghost" @click="query = ''; subjectFilter = ''; statusFilter = ''">清除筛选</button></div>

    <div v-else class="mistake-list">
      <article v-for="item in visibleItems" :key="item.id" class="mistake-card card">
        <div class="mistake-topline"><div class="meta-line"><span class="subject-mark">{{ item.subjectName || '未分类' }}</span><span v-if="item.knowledgePointName" class="meta-separator">/</span><span v-if="item.knowledgePointName">{{ item.knowledgePointName }}</span><span class="meta-separator">·</span><time>{{ formatDate(item.createdAt) }}</time><span v-if="item.builtIn" class="built-in-label">内置示例</span></div><select class="status-select" :value="item.masteryStatus" :aria-label="`设置${item.title}的错题状态`" @change="updateStatus(item, $event)"><option v-for="status in MASTERY_STATUS_LIST" :key="status.code" :value="status.code">{{ status.label }}</option></select></div>
        <h2 class="mistake-title">{{ item.title }}</h2>
        <p v-if="item.questionText" class="question-text">{{ item.questionText }}</p>
        <div v-if="item.images?.length" class="mistake-images"><button v-for="(image, index) in item.images" :key="`${item.id}-${image.name}`" class="image-open" type="button" :aria-label="`放大查看${image.name || '题目图片'}`" @click="openImage(imageUrl(item, index), image.name || '题目图片')"><img :src="imageUrl(item, index)" :alt="image.name || '题目图片'" /></button></div>
        <div v-if="item.tags?.length" class="tag-list"><span v-for="tag in item.tags" :key="tag">{{ tag }}</span></div>
        <div class="mistake-bottom"><span class="reason-label">{{ ERROR_REASON_MAP[item.reasonCode] || '未记录原因' }}</span><span v-if="item.source" class="source-label">来源：{{ item.source }}</span><div class="record-actions"><button type="button" class="text-action" @click="toggleExpanded(item.id)">{{ expanded.has(item.id) ? '收起详情' : '查看答案与解析' }}</button><RouterLink :to="`/library/new?id=${item.id}`" class="text-action">编辑</RouterLink><button type="button" class="text-action danger-action" @click="removeItem(item)">删除</button></div></div>
        <div v-if="expanded.has(item.id)" class="answer-panel"><div><h3>参考答案</h3><p>{{ item.answer || '还没有记录答案' }}</p><div v-if="item.answerImages?.length" class="answer-image-list"><button v-for="(image, index) in item.answerImages" :key="`${item.id}-answer-${image.name}`" class="image-open" type="button" :aria-label="`放大查看${image.name || '答案图片'}`" @click="openImage(answerImageUrl(item, index), image.name || '答案图片')"><img :src="answerImageUrl(item, index)" :alt="image.name || '答案图片'" /></button></div></div><div><h3>解析 / 我的思路</h3><p>{{ item.analysis || '还没有记录解析' }}</p></div><div v-if="item.reasonNote"><h3>错误原因补充</h3><p>{{ item.reasonNote }}</p></div></div>
      </article>
    </div>
    <p class="storage-hint">本地模式 · 记录保存在当前浏览器的本地数据库中</p>

    <div v-if="activeImage" class="image-lightbox" role="presentation" @click.self="closeImage">
      <section class="lightbox-panel" role="dialog" aria-modal="true" :aria-label="activeImage.name">
        <button class="lightbox-close" type="button" aria-label="关闭图片预览" @click="closeImage">×</button>
        <img :src="activeImage.url" :alt="activeImage.name" />
        <p>{{ activeImage.name }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.question-text{margin-top:9px;color:var(--ink-2);font-size:13px;line-height:1.8;white-space:pre-wrap}.image-open{display:block;padding:0;border:0;background:transparent;cursor:zoom-in;border-radius:8px}.image-open:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.answer-image-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}.answer-image-list img{width:auto;max-width:min(240px,100%);height:130px;object-fit:contain;border:1px solid var(--line);border-radius:7px;background:#fff}.image-lightbox{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:24px;background:rgba(16,18,22,.82);backdrop-filter:blur(3px)}.lightbox-panel{position:relative;display:flex;flex-direction:column;align-items:center;max-width:min(1100px,96vw);max-height:94vh}.lightbox-panel>img{max-width:100%;max-height:85vh;object-fit:contain;border-radius:8px;background:#fff}.lightbox-panel>p{margin-top:9px;color:#fff;font-size:12px}.lightbox-close{position:absolute;right:-14px;top:-14px;z-index:1;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#fff;color:var(--ink);font-size:25px;line-height:1;box-shadow:0 3px 14px rgba(0,0,0,.22)}
.status-select{height:30px;min-width:104px;padding:0 24px 0 9px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink-2);font:inherit;font-size:11.5px;cursor:pointer}.built-in-label{border:1px solid var(--line);border-radius:999px;padding:1px 7px;color:var(--ink-3);font-size:10px}.status-error{margin:-7px 0 14px;color:#a33829;font-size:12px}
.library-page{padding-top:44px}.library-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.library-heading h1{font-size:30px;letter-spacing:-.03em;margin-top:5px}.library-heading p:not(.eyebrow){font-size:13.5px;color:var(--ink-2);margin-top:7px}.library-toolbar{display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:16px}.search-box{display:flex;align-items:center;gap:9px;flex:1;min-width:180px;padding:0 10px}.search-box svg{width:17px;height:17px;fill:none;stroke:var(--ink-3);stroke-width:1.7}.search-box input{width:100%;height:36px;border:0;outline:0;background:transparent;font:inherit;font-size:13px}.library-toolbar select{height:36px;min-width:125px;padding:0 28px 0 10px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink-2);font:inherit;font-size:12px}.result-count{white-space:nowrap;color:var(--ink-3);font-size:12px;padding:0 5px}.empty-card{display:flex;min-height:250px;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:35px 20px}.empty-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:var(--accent-soft);color:var(--accent);font-weight:600;font-size:18px}.empty-card h2{margin-top:15px;font-size:16px}.empty-card p{margin:6px 0 17px;color:var(--ink-3);font-size:13px}.empty-card .btn{margin-top:8px}.mistake-list{display:flex;flex-direction:column;gap:12px}.mistake-card{padding:19px 22px 16px}.mistake-topline,.meta-line,.mistake-bottom,.record-actions{display:flex;align-items:center}.mistake-topline{justify-content:space-between;gap:12px}.meta-line{gap:8px;flex-wrap:wrap;color:var(--ink-3);font-size:11.5px}.subject-mark{color:var(--ink-2);font-weight:600}.meta-separator{color:var(--ink-4)}.status-pill{flex-shrink:0;background:#f1f1ee;color:#696e76;border-radius:999px;padding:3px 9px;font-size:11px}.mistake-title{font-size:15px;line-height:1.75;font-weight:500;white-space:pre-wrap;margin-top:14px}.mistake-images{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.mistake-images img{width:auto;max-width:min(260px,100%);height:150px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#f6f6f3}.tag-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.tag-list span{font-size:10.5px;color:#646a73;background:#f3f3f0;padding:3px 8px;border-radius:999px}.mistake-bottom{gap:11px;flex-wrap:wrap;margin-top:14px;padding-top:11px;border-top:1px solid var(--line)}.reason-label{font-size:11.5px;color:#9a6515}.source-label{font-size:11.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%}.record-actions{margin-left:auto;gap:13px}.text-action{font:inherit;font-size:11.5px;color:var(--ink-2)}.text-action:hover{color:var(--accent)}.danger-action:hover{color:#b33b2c}.answer-panel{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:15px;padding:15px 16px;border-radius:9px;background:var(--surface-2)}.answer-panel h3{font-size:11.5px;color:var(--ink-3);font-weight:500;margin-bottom:4px}.answer-panel p{font-size:13px;white-space:pre-wrap;line-height:1.75}.storage-hint{text-align:center;color:var(--ink-4);font-size:11.5px;margin-top:20px;margin-bottom:30px}@media(max-width:720px){.library-page{padding-top:30px}.library-heading{align-items:flex-start}.library-heading h1{font-size:25px}.library-toolbar{flex-wrap:wrap}.search-box{flex-basis:100%;padding:0}.library-toolbar select{flex:1;min-width:0}.result-count{margin-left:auto}.mistake-card{padding:16px}.source-label{max-width:100%;flex-basis:100%}.record-actions{margin-left:0}.answer-panel{grid-template-columns:1fr}}
</style>

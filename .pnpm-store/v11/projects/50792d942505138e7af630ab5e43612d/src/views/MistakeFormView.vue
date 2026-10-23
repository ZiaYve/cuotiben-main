<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ERROR_REASONS } from '@/constants/enums'
import { knowledgePoints, subjects, tags as defaultTags } from '@/mock/data'
import { getLocalMistake, saveLocalMistake } from '@/storage/mistakes'

const route = useRoute()
const router = useRouter()
const isEditing = computed(() => Boolean(route.query.id))
const saving = ref(false)
const error = ref('')
const selectedFiles = ref([])
const previews = ref([])
const existingImages = ref([])
const keepExisting = ref([])
const customTag = ref('')
const form = reactive({
  title: '', answer: '', analysis: '', subjectId: '', knowledgePointId: '',
  tags: [], source: '', reasonCode: '', reasonNote: ''
})
const points = computed(() => knowledgePoints[form.subjectId] ?? [])

function revokePreviews() {
  previews.value.forEach((item) => URL.revokeObjectURL(item.url))
  previews.value = []
}

async function loadExisting() {
  if (!route.query.id) return
  const item = await getLocalMistake(route.query.id)
  if (!item) {
    error.value = '这条错题不存在或已删除。'
    return
  }
  Object.assign(form, {
    title: item.title ?? '', answer: item.answer ?? '', analysis: item.analysis ?? '',
    subjectId: item.subjectId ?? '', knowledgePointId: item.knowledgePointId ?? '',
    tags: [...(item.tags ?? [])], source: item.source ?? '',
    reasonCode: item.reasonCode ?? '', reasonNote: item.reasonNote ?? ''
  })
  existingImages.value = (item.images ?? []).map((image, index) => ({
    ...image, url: URL.createObjectURL(image.blob), index
  }))
  keepExisting.value = existingImages.value.map((_, index) => index)
}

function chooseFiles(event) {
  error.value = ''
  const files = [...(event.target.files ?? [])]
  const accepted = []
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  for (const file of files) {
    if (!allowed.includes(file.type)) {
      error.value = '图片仅支持 JPG、PNG、WebP 或 GIF 格式。'
      continue
    }
    if (file.size > 10 * 1024 * 1024) {
      error.value = `${file.name} 超过 10 MB，请压缩后再上传。`
      continue
    }
    accepted.push(file)
  }
  selectedFiles.value = [...selectedFiles.value, ...accepted]
  revokePreviews()
  previews.value = selectedFiles.value.map((file) => ({
    name: file.name, url: URL.createObjectURL(file)
  }))
  event.target.value = ''
}

function removeNewImage(index) {
  selectedFiles.value.splice(index, 1)
  revokePreviews()
  previews.value = selectedFiles.value.map((file) => ({
    name: file.name, url: URL.createObjectURL(file)
  }))
}

function removeExistingImage(index) {
  keepExisting.value = keepExisting.value.filter((item) => item !== index)
  const image = existingImages.value[index]
  if (image?.url) URL.revokeObjectURL(image.url)
}

function addCustomTag() {
  const value = customTag.value.trim()
  if (value && !form.tags.includes(value)) form.tags.push(value)
  customTag.value = ''
}

async function submit() {
  error.value = ''
  const hasImage = selectedFiles.value.length > 0 || keepExisting.value.length > 0
  if (!form.title.trim() && !hasImage) {
    error.value = '请填写题目内容或添加题目图片。'
    return
  }
  if (!form.subjectId) {
    error.value = '请选择学科。'
    return
  }
  if (!form.reasonCode) {
    error.value = '请选择错误原因。'
    return
  }
  saving.value = true
  try {
    const subject = subjects.find((item) => String(item.id) === String(form.subjectId))
    const point = points.value.find((item) => String(item.id) === String(form.knowledgePointId))
    const old = isEditing.value ? await getLocalMistake(route.query.id) : null
    const images = [
      ...(old?.images ?? []).filter((_, index) => keepExisting.value.includes(index)),
      ...selectedFiles.value.map((file) => ({ name: file.name, type: file.type, blob: file }))
    ]
    await saveLocalMistake({
      ...form,
      title: form.title.trim() || '图片题目',
      id: old?.id,
      subjectId: Number(form.subjectId),
      subjectName: subject?.name ?? '',
      knowledgePointId: form.knowledgePointId ? Number(form.knowledgePointId) : null,
      knowledgePointName: point?.name ?? '',
      tags: [...form.tags],
      reasonLabel: ERROR_REASONS.find((item) => item.code === form.reasonCode)?.label ?? '',
      images,
      imageUrls: [],
      masteryStatus: old?.masteryStatus ?? 'NOT_REVIEWED'
    })
    await router.push('/library')
  } catch {
    error.value = '保存失败。请检查浏览器存储空间后重试。'
  } finally {
    saving.value = false
  }
}

onMounted(loadExisting)
onUnmounted(() => {
  revokePreviews()
  existingImages.value.forEach((image) => URL.revokeObjectURL(image.url))
})
</script>

<template>
  <section class="container form-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">个人错题库</p>
        <h1>{{ isEditing ? '编辑错题' : '录入一道错题' }}</h1>
        <p class="page-intro">把题目和当时卡住的地方记下来，之后复习会更有针对性。</p>
      </div>
      <RouterLink to="/library" class="back-link">返回错题库</RouterLink>
    </div>

    <form class="entry-card card" @submit.prevent="submit">
      <div class="form-section">
        <div class="section-heading"><span>01</span><div><h2>题目内容</h2><p>可粘贴文字，也可以添加题目图片</p></div></div>
        <label class="field-label" for="question">题目文字</label>
        <textarea id="question" v-model="form.title" class="input question-input" rows="5" placeholder="输入题目内容、条件或题干…；纯图片题也可以留空"></textarea>
        <div class="upload-box">
          <label class="upload-trigger" for="question-images">
            <span class="upload-icon">＋</span><span><strong>添加题目图片</strong><small>JPG、PNG、WebP、GIF，单张不超过 10 MB</small></span>
          </label>
          <input id="question-images" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple @change="chooseFiles" />
          <div v-if="existingImages.length || previews.length" class="image-grid">
            <figure v-for="image in existingImages" v-show="keepExisting.includes(image.index)" :key="`old-${image.index}`" class="image-preview">
              <img :src="image.url" :alt="image.name" /><button type="button" aria-label="移除图片" @click="removeExistingImage(image.index)">×</button>
            </figure>
            <figure v-for="(image, index) in previews" :key="`new-${image.name}-${index}`" class="image-preview">
              <img :src="image.url" :alt="image.name" /><button type="button" aria-label="移除图片" @click="removeNewImage(index)">×</button>
            </figure>
          </div>
        </div>
      </div>

      <div class="form-section two-columns">
        <div class="section-heading wide"><span>02</span><div><h2>答案与解析</h2><p>留下正确做法，复习时可以对照</p></div></div>
        <div class="field"><label class="field-label" for="answer">参考答案</label><textarea id="answer" v-model="form.answer" class="input" rows="3" placeholder="记录正确答案或关键步骤"></textarea></div>
        <div class="field"><label class="field-label" for="analysis">解析 / 我的思路</label><textarea id="analysis" v-model="form.analysis" class="input" rows="3" placeholder="为什么会错？正确思路是什么？"></textarea></div>
      </div>

      <div class="form-section">
        <div class="section-heading"><span>03</span><div><h2>分类与来源</h2><p>帮助你之后按主题找到这道题</p></div></div>
        <div class="form-grid">
          <div class="field"><label class="field-label" for="subject">学科 <em>*</em></label><select id="subject" v-model="form.subjectId" class="input" required @change="form.knowledgePointId = ''"><option value="">选择学科</option><option v-for="subject in subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option></select></div>
          <div class="field"><label class="field-label" for="knowledge">知识点</label><select id="knowledge" v-model="form.knowledgePointId" class="input" :disabled="!form.subjectId"><option value="">选择知识点（可选）</option><option v-for="point in points" :key="point.id" :value="point.id">{{ point.name }}</option></select></div>
          <div class="field"><label class="field-label" for="source">题目来源</label><input id="source" v-model="form.source" class="input" placeholder="例如：教材、试卷、课程与页码" /></div>
          <div class="field"><label class="field-label" for="reason">错误原因 <em>*</em></label><select id="reason" v-model="form.reasonCode" class="input" required><option value="">选择主要原因</option><option v-for="reason in ERROR_REASONS" :key="reason.code" :value="reason.code">{{ reason.label }}</option></select></div>
          <div class="field wide"><label class="field-label" for="reason-note">原因补充</label><input id="reason-note" v-model="form.reasonNote" class="input" placeholder="具体是哪一步出了问题？（可选）" /></div>
          <div class="field wide"><span class="field-label">标签</span><div class="tag-options"><button v-for="tag in defaultTags" :key="tag.id" type="button" class="tag-choice" :class="{ selected: form.tags.includes(tag.name) }" @click="form.tags.includes(tag.name) ? form.tags.splice(form.tags.indexOf(tag.name), 1) : form.tags.push(tag.name)">{{ tag.name }}<span v-if="form.tags.includes(tag.name)">✓</span></button></div><div class="custom-tag"><input v-model="customTag" class="input" placeholder="添加自定义标签" @keydown.enter.prevent="addCustomTag" /><button type="button" class="btn btn--ghost" @click="addCustomTag">添加标签</button></div><div v-if="form.tags.length" class="selected-tags"><button v-for="tag in form.tags" :key="tag" type="button" class="selected-tag" :aria-label="`移除${tag}`" @click="form.tags.splice(form.tags.indexOf(tag), 1)">{{ tag }} <span>×</span></button></div></div>
        </div>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-actions"><RouterLink to="/library" class="btn btn--ghost">取消</RouterLink><button class="btn btn--primary btn--lg" type="submit" :disabled="saving">{{ saving ? '正在保存…' : isEditing ? '保存修改' : '保存到我的错题库' }}</button></div>
      <p class="local-note">记录保存在当前浏览器中，默认状态为「未复习」。</p>
    </form>
  </section>
</template>

<style scoped>
.form-page{max-width:900px;padding-top:46px}.page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.page-heading h1{font-size:30px;letter-spacing:-.03em;margin-top:7px}.page-intro{color:var(--ink-2);font-size:14px;margin-top:8px}.back-link{font-size:13px;color:var(--ink-2);padding:8px 0}.back-link:hover{color:var(--accent)}.entry-card{padding:0 30px 26px}.form-section{padding:27px 0 30px;border-bottom:1px solid var(--line)}.section-heading{display:flex;gap:14px;align-items:flex-start;margin-bottom:22px}.section-heading>span{font:12px var(--font-mono);color:var(--ink-4);padding-top:3px}.section-heading h2{font-size:15px;font-weight:600}.section-heading p{font-size:12.5px;color:var(--ink-3);margin-top:3px}.field-label{display:block;font-size:13px;font-weight:500;margin-bottom:8px}.field-label em{color:#ba4c39;font-style:normal}.input{width:100%;border:1px solid var(--line-strong);border-radius:8px;background:#fff;padding:11px 12px;color:var(--ink);font:inherit;font-size:13.5px;line-height:1.65;outline:none;transition:border-color .15s,box-shadow .15s}.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(44,75,214,.09)}.input::placeholder{color:#a0a5ac}.input:disabled{background:#f4f4f1;color:var(--ink-3)}textarea.input{resize:vertical;min-height:82px}.question-input{min-height:132px!important}.upload-box{margin-top:14px;border:1px dashed var(--line-strong);border-radius:10px;padding:14px;background:var(--surface-2)}.upload-trigger{display:flex;align-items:center;gap:12px;cursor:pointer}.upload-icon{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink-2);font-size:20px}.upload-trigger strong,.upload-trigger small{display:block}.upload-trigger strong{font-size:12.5px;font-weight:600}.upload-trigger small{font-size:11.5px;color:var(--ink-3);margin-top:2px}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.image-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.image-preview{position:relative;width:110px;height:92px;border-radius:8px;overflow:hidden;background:#efefeb;border:1px solid var(--line)}.image-preview img{width:100%;height:100%;object-fit:cover}.image-preview button{position:absolute;top:5px;right:5px;width:23px;height:23px;border-radius:50%;background:rgba(20,20,20,.72);color:white;font-size:17px;line-height:1}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}.wide{grid-column:1/-1}.field{margin-bottom:17px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}.tag-options{display:flex;gap:8px;flex-wrap:wrap}.tag-choice{padding:5px 10px;border:1px solid var(--line);border-radius:999px;background:white;font-size:12px;color:var(--ink-2)}.tag-choice.selected{border-color:#cbd3f6;background:var(--accent-soft);color:var(--accent)}.tag-choice span{margin-left:5px}.custom-tag{display:flex;gap:8px;margin-top:10px}.custom-tag .input{max-width:260px;padding:7px 10px;font-size:12.5px}.custom-tag .btn{height:36px;font-size:12px}.selected-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.selected-tag{background:#f1f1ee;border-radius:999px;padding:4px 9px;font-size:11.5px;color:var(--ink-2)}.selected-tag span{margin-left:3px}.form-error{margin-top:17px;padding:10px 12px;border-radius:8px;background:#fff0ed;color:#a33829;font-size:13px}.form-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:23px}.local-note{text-align:right;color:var(--ink-3);font-size:11.5px;margin-top:10px}@media(max-width:640px){.form-page{padding-top:30px}.page-heading{align-items:flex-start}.page-heading h1{font-size:25px}.entry-card{padding:0 17px 20px}.form-section{padding:23px 0}.two-columns,.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}.form-actions .btn:last-child{flex:1}.local-note{text-align:left}}
</style>

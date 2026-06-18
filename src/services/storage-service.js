export const createStorageService = (deps = {}) => {
  const {
    multer,
    path,
    fs,
    crypto,
    fetchWithTimeout,
    uploadDir,
    productImageDir,
    telegramMediaDir,
    quotas,
    MB
  } = deps;

  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = path.join(uploadDir, req.user.clientId);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\- ]+/g, '_')}`);
    }
  });

  const allowedKnowledgeMimes = new Set([
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]);

  const allowedKnowledgeExts = new Set(['.txt', '.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp']);

  const knowledgeFileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const ok = allowedKnowledgeMimes.has(file.mimetype) && allowedKnowledgeExts.has(ext);
    cb(ok ? null : new Error('Unsupported upload type. Use TXT, PDF, DOCX, PNG, JPG, or WEBP files.'), ok);
  };

  const upload = multer({
    storage,
    limits: { files: 10, fileSize: 25 * 1024 * 1024 },
    fileFilter: knowledgeFileFilter
  });

  const productStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = path.join(productImageDir, req.user.clientId);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\- ]+/g, '_')}`);
    }
  });

  const productUpload = multer({
    storage: productStorage,
    limits: { files: 9, fileSize: quotas.maxProductImageMb * MB },
    fileFilter: (req, file, cb) => {
      cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype));
    }
  });

  const cleanupUploadedFiles = async files => {
    for (const file of files || []) {
      await fs.unlink(file.path).catch(() => null);
    }
  };

  const extractText = async file => {
    const ext = path.extname(file.originalname).toLowerCase();
    try {
      if (ext === '.txt') return await fs.readFile(file.path, 'utf8');
      if (ext === '.docx') {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: file.path });
        return result.value || '';
      }
      if (ext === '.pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(await fs.readFile(file.path));
        return result.text || '';
      }
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        return 'Image uploaded. OCR extraction can be enabled later for image text.';
      }
    } catch (error) {
      return `Upload saved, but text extraction failed: ${error.message}`;
    }
    return 'File uploaded. Text extraction is not available for this file type yet.';
  };

  const downloadTelegramFile = async (ctx, fileId, suggestedName) => {
    const link = await ctx.telegram.getFileLink(fileId);
    const response = await fetchWithTimeout(link.href);
    if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
    const ext = path.extname(new URL(link.href).pathname) || path.extname(suggestedName || '') || '.bin';
    const filePath = path.join(telegramMediaDir, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return filePath;
  };

  return {
    storage,
    upload,
    productUpload,
    cleanupUploadedFiles,
    extractText,
    downloadTelegramFile
  };
};

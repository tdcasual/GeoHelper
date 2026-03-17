import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useState
} from "react";

import { type ChatAttachment } from "../../state/chat-store";
import { readFileAsDataUrl } from "./file-utils";

interface ComposerDraftState {
  text: string;
  attachments: ChatAttachment[];
}

interface UseComposerAttachmentsInput {
  draftAttachments: ChatAttachment[];
  supportsVisionUpload: boolean;
  unsupportedVisionNotice: string;
  setPlusMenuOpen: (open: boolean) => void;
  setDraftStateForActiveConversation: (
    updater:
      | ComposerDraftState
      | ((previous: ComposerDraftState) => ComposerDraftState)
  ) => void;
  setAttachmentsForActiveConversation: (attachments: ChatAttachment[]) => void;
}

export const useComposerAttachments = ({
  draftAttachments,
  supportsVisionUpload,
  unsupportedVisionNotice,
  setPlusMenuOpen,
  setDraftStateForActiveConversation,
  setAttachmentsForActiveConversation
}: UseComposerAttachmentsInput) => {
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [composerDragActive, setComposerDragActive] = useState(false);

  const appendImageAttachments = async (files: FileList | File[]) => {
    if (!supportsVisionUpload) {
      setComposerNotice(unsupportedVisionNotice);
      return;
    }

    const incoming = Array.from(files);
    const imageFiles = incoming.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setComposerNotice("仅支持上传图片文件");
      return;
    }

    const availableSlots = Math.max(0, 4 - draftAttachments.length);
    if (availableSlots === 0) {
      setComposerNotice("最多上传 4 张图片");
      return;
    }

    const selectedFiles = imageFiles.slice(0, availableSlots);
    if (selectedFiles.length < imageFiles.length) {
      setComposerNotice("最多上传 4 张图片");
    } else {
      setComposerNotice(null);
    }

    const nextAttachments = await Promise.all(
      selectedFiles.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: `${Date.now()}_${file.name}_${Math.random().toString(16).slice(2, 8)}`,
          kind: "image" as const,
          name: file.name,
          mimeType: file.type || "image/*",
          size: file.size,
          previewUrl: dataUrl,
          transportPayload: dataUrl
        } satisfies ChatAttachment;
      })
    );

    setDraftStateForActiveConversation((previous) => ({
      ...previous,
      attachments: [...previous.attachments, ...nextAttachments]
    }));
    setPlusMenuOpen(false);
  };

  const handleComposerImageChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    await appendImageAttachments(files);
    event.target.value = "";
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachmentsForActiveConversation(
      draftAttachments.filter((attachment) => attachment.id !== attachmentId)
    );
  };

  const handleComposerPaste = async (
    event: ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    const hasImage = files.some((file) => file.type.startsWith("image/"));
    if (!hasImage) {
      return;
    }

    event.preventDefault();
    await appendImageAttachments(files);
  };

  const handleComposerDragOver = (event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    const hasImage = files.some((file) => file.type.startsWith("image/"));
    if (!hasImage) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setComposerDragActive(true);
  };

  const handleComposerDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setComposerDragActive(false);
    }
  };

  const handleComposerDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setComposerDragActive(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }

    await appendImageAttachments(files);
  };

  return {
    composerNotice,
    composerDragActive,
    handleComposerImageChange,
    handleComposerPaste,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
    removeAttachment,
    setComposerNotice
  };
};

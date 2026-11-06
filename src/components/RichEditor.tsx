import { Extension } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Code2,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Surligne les passages à compléter [VOTRE EXPÉRIENCE : …] / [À VÉRIFIER : …] pour qu'on ne les oublie pas.
const TodoMarks = Extension.create({
  name: "todoMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const re = /\[(VOTRE EXPÉRIENCE|VOTRE DONNÉE|À VÉRIFIER)[^\]]*\]/g;
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(re))
                decos.push(
                  Decoration.inline(pos + m.index!, pos + m.index! + m[0].length, {
                    class: "todo-mark",
                  }),
                );
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

const COLORS = ["#16231b", "#1f6b45", "#d93a3a", "#d98a0b", "#2563eb", "#7c3aed", "#5f6d64"];

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm transition hover:bg-accent disabled:opacity-30 ${active ? "bg-primary text-primary-foreground hover:bg-primary" : ""}`}
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" />;

function Toolbar({ editor }: { editor: Editor }) {
  const [colorOpen, setColorOpen] = useState(false);
  const c = () => editor.chain().focus();
  const inTable = editor.isActive("table");

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresse du lien (laisser vide pour retirer)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) return void c().extendMarkRange("link").unsetLink().run();
    c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  const addImage = () => {
    const src = window.prompt("Adresse de l'image (https://…)");
    if (!src?.trim()) return;
    const alt =
      window.prompt(
        "Texte alternatif : décrivez l'image (important pour le SEO et l'accessibilité)",
      ) ?? "";
    c().setImage({ src: src.trim(), alt }).run();
  };
  const heading = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 })
      ? "2"
      : editor.isActive("heading", { level: 3 })
        ? "3"
        : editor.isActive("heading", { level: 4 })
          ? "4"
          : "0";

  return (
    <div className="sticky top-0 z-10 rounded-t-lg border-b bg-surface">
      <div className="flex items-center gap-0.5 overflow-x-auto p-1.5">
        <Btn title="Annuler" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-4 w-4" />
        </Btn>
        <Btn title="Rétablir" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-4 w-4" />
        </Btn>
        <Sep />
        <select
          aria-label="Style de paragraphe"
          value={heading}
          onChange={(e) =>
            e.target.value === "0"
              ? c().setParagraph().run()
              : c()
                  .toggleHeading({ level: Number(e.target.value) as 1 | 2 | 3 | 4 })
                  .run()
          }
          className="h-8 shrink-0 rounded-md border bg-background px-2 text-sm"
        >
          <option value="0">Paragraphe</option>
          <option value="1">Titre 1 (H1)</option>
          <option value="2">Titre 2 (H2)</option>
          <option value="3">Titre 3 (H3)</option>
          <option value="4">Titre 4 (H4)</option>
        </select>
        <Sep />
        <Btn title="Gras" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn
          title="Italique"
          active={editor.isActive("italic")}
          onClick={() => c().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn
          title="Souligné"
          active={editor.isActive("underline")}
          onClick={() => c().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Btn>
        <Btn
          title="Barré"
          active={editor.isActive("strike")}
          onClick={() => c().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </Btn>
        <Btn
          title="Surligné"
          active={editor.isActive("highlight")}
          onClick={() => c().toggleHighlight().run()}
        >
          <Highlighter className="h-4 w-4" />
        </Btn>
        <div className="relative">
          <Btn title="Couleur du texte" active={colorOpen} onClick={() => setColorOpen((o) => !o)}>
            <Palette className="h-4 w-4" />
          </Btn>
          {colorOpen && (
            <div className="absolute left-0 top-9 z-20 flex gap-1 rounded-md border bg-popover p-2 shadow-lg">
              {COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  aria-label={`Couleur ${col}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    c().setColor(col).run();
                    setColorOpen(false);
                  }}
                  className="h-6 w-6 rounded-full border"
                  style={{ background: col }}
                />
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  c().unsetColor().run();
                  setColorOpen(false);
                }}
                className="rounded border px-2 text-xs"
              >
                Par défaut
              </button>
            </div>
          )}
        </div>
        <Btn title="Code" active={editor.isActive("code")} onClick={() => c().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </Btn>
        <Btn
          title="Exposant"
          active={editor.isActive("superscript")}
          onClick={() => c().toggleSuperscript().run()}
        >
          <SupIcon className="h-4 w-4" />
        </Btn>
        <Btn
          title="Indice"
          active={editor.isActive("subscript")}
          onClick={() => c().toggleSubscript().run()}
        >
          <SubIcon className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn
          title="Aligner à gauche"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => c().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </Btn>
        <Btn
          title="Centrer"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => c().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </Btn>
        <Btn
          title="Aligner à droite"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => c().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </Btn>
        <Btn
          title="Justifier"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => c().setTextAlign("justify").run()}
        >
          <AlignJustify className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn
          title="Liste à puces"
          active={editor.isActive("bulletList")}
          onClick={() => c().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Btn>
        <Btn
          title="Liste numérotée"
          active={editor.isActive("orderedList")}
          onClick={() => c().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <Btn
          title="Citation"
          active={editor.isActive("blockquote")}
          onClick={() => c().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </Btn>
        <Btn
          title="Bloc de code"
          active={editor.isActive("codeBlock")}
          onClick={() => c().toggleCodeBlock().run()}
        >
          <Code2 className="h-4 w-4" />
        </Btn>
        <Btn title="Ligne de séparation" onClick={() => c().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn title="Insérer un lien" active={editor.isActive("link")} onClick={setLink}>
          <Link2 className="h-4 w-4" />
        </Btn>
        <Btn
          title="Retirer le lien"
          disabled={!editor.isActive("link")}
          onClick={() => c().unsetLink().run()}
        >
          <Link2Off className="h-4 w-4" />
        </Btn>
        <Btn title="Insérer une image" onClick={addImage}>
          <ImagePlus className="h-4 w-4" />
        </Btn>
        <Btn
          title="Insérer un tableau"
          onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table2 className="h-4 w-4" />
        </Btn>
        <Btn
          title="Effacer la mise en forme"
          onClick={() => c().unsetAllMarks().clearNodes().run()}
        >
          <Eraser className="h-4 w-4" />
        </Btn>
      </div>
      {inTable && (
        <div className="flex items-center gap-1 overflow-x-auto border-t bg-accent/40 p-1.5 text-xs">
          <span className="font-data shrink-0 px-1 uppercase tracking-widest text-muted-foreground">
            Tableau
          </span>
          {(
            [
              ["+ Colonne", () => c().addColumnAfter().run()],
              ["+ Ligne", () => c().addRowAfter().run()],
              ["− Colonne", () => c().deleteColumn().run()],
              ["− Ligne", () => c().deleteRow().run()],
              ["En-tête", () => c().toggleHeaderRow().run()],
              ["Supprimer", () => c().deleteTable().run()],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={fn}
              className="shrink-0 rounded border bg-background px-2 py-1 hover:bg-accent"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RichEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const lastEmitted = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener" } },
      }),
      TextStyle,
      Color,
      Highlight,
      Subscript,
      Superscript,
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "Écrivez ici…" }),
      TodoMarks,
    ],
    content: value,
    editorProps: { attributes: { class: "rich-content", spellcheck: "true", lang: "fr" } },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // Contenu modifié depuis l'extérieur (brouillon IA, ouverture d'un article)
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return <div className="min-h-[24rem] rounded-lg border bg-card" />;
  return (
    <div className="rich-editor min-w-0 max-w-full rounded-lg border bg-card">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

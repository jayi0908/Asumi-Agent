#!/usr/bin/env python3
"""
Galgame 立绘拼接预览器（基于 script/ + imgs/）

功能:
1) 默认按 script/ 中出现过的组合预览（file + face）
2) 可切换自由组合（身体 x 脸部）
3) 支持按目录 no/z1/z2/fa 切换
4) 点击按钮导出当前组合，或批量导出当前列表到指定目录

依赖:
    pip install pillow
"""

from __future__ import annotations

import os
import re
import sys
import zlib
from dataclasses import dataclass
from itertools import product
from pathlib import Path
from tkinter import (
    BOTH,
    END,
    LEFT,
    RIGHT,
    VERTICAL,
    Button,
    Checkbutton,
    Entry,
    Frame,
    IntVar,
    Label,
    Listbox,
    OptionMenu,
    PanedWindow,
    Scrollbar,
    StringVar,
    Tk,
    filedialog,
    messagebox,
)

from PIL import Image, ImageTk


SCRIPT_FG_RE = re.compile(
    r'\{"fg",.*?file="(?P<file>[^"]+)".*?face="(?P<face>[^"]+)".*?path=":fg/asu/(?P<size>[^/]+)/"',
    re.IGNORECASE,
)
BODY_RE = re.compile(r"^asu_[a-z0-9]+$")
FACE_RE = re.compile(r"^[ab]\d{4}[fgh]?$")
BODY_AB_RE = re.compile(r"([ab])\d{4}$", re.IGNORECASE)


@dataclass(frozen=True)
class Combo:
    size: str
    body: str
    face: str

    def label(self) -> str:
        return f"{self.size} | {self.body} + {self.face}"

    def out_name(self) -> str:
        return f"{self.body}__{self.face}.png"


def parse_png_pos_comment(path: Path) -> tuple[int, int]:
    """
    从 PNG 文本块里提取 pos 注释:
    pos,x,y,w,h...
    返回 (x, y)，失败返回 (0, 0)
    """
    try:
        with path.open("rb") as f:
            sig = f.read(8)
            if sig != b"\x89PNG\r\n\x1a\n":
                return (0, 0)
            while True:
                ln_raw = f.read(4)
                if len(ln_raw) < 4:
                    break
                length = int.from_bytes(ln_raw, "big")
                ctype = f.read(4)
                data = f.read(length)
                _crc = f.read(4)
                if ctype == b"IEND":
                    break
                text_payload = None
                if ctype == b"tEXt":
                    text_payload = data
                elif ctype == b"zTXt":
                    # keyword\0compression_method compressed_text
                    try:
                        i = data.index(b"\x00")
                        comp = data[i + 1]
                        if comp == 0:
                            text_payload = zlib.decompress(data[i + 2 :])
                    except Exception:
                        pass
                elif ctype == b"iTXt":
                    # keyword\0comp_flag\0comp_method\0lang\0translated\0text
                    try:
                        i = data.index(b"\x00")
                        rest = data[i + 1 :]
                        if len(rest) < 2:
                            continue
                        comp_flag = rest[0]
                        # rest[1] comp_method
                        cursor = 2
                        j = rest.index(b"\x00", cursor)  # language
                        cursor = j + 1
                        j = rest.index(b"\x00", cursor)  # translated keyword
                        cursor = j + 1
                        text_part = rest[cursor:]
                        if comp_flag == 1:
                            text_payload = zlib.decompress(text_part)
                        else:
                            text_payload = text_part
                    except Exception:
                        pass

                if not text_payload:
                    continue
                try:
                    text = text_payload.decode("utf-8", errors="ignore")
                except Exception:
                    continue
                m = re.search(r"pos,(-?\d+),(-?\d+),", text)
                if m:
                    return (int(m.group(1)), int(m.group(2)))
    except Exception:
        return (0, 0)
    return (0, 0)


def composite_images(body_path: Path, face_path: Path) -> Image.Image:
    body = Image.open(body_path).convert("RGBA")
    face = Image.open(face_path).convert("RGBA")

    bx, by = parse_png_pos_comment(body_path)
    fx, fy = parse_png_pos_comment(face_path)

    min_x = min(bx, fx)
    min_y = min(by, fy)
    max_x = max(bx + body.width, fx + face.width)
    max_y = max(by + body.height, fy + face.height)

    canvas = Image.new("RGBA", (max_x - min_x, max_y - min_y), (0, 0, 0, 0))
    canvas.alpha_composite(body, dest=(bx - min_x, by - min_y))
    canvas.alpha_composite(face, dest=(fx - min_x, fy - min_y))
    return canvas


def create_checkerboard(w: int, h: int, cell: int = 16) -> Image.Image:
    bg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    c1 = (230, 230, 230, 255)
    c2 = (200, 200, 200, 255)
    px = bg.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = c1 if ((x // cell) + (y // cell)) % 2 == 0 else c2
    return bg


def extract_body_ab(body: str) -> str:
    """
    从 body 文件名中提取 a/b:
    例: asu_z1a0500 -> a, asu_z2b0210 -> b
    """
    m = BODY_AB_RE.search(body or "")
    return m.group(1).lower() if m else ""


def extract_face_ab(face: str) -> str:
    """
    从 face 文件名中提取 a/b:
    例: a0014h -> a, b0020 -> b
    """
    return (face[0].lower() if face else "") if FACE_RE.match(face or "") else ""


def is_ab_compatible(body: str, face: str) -> bool:
    body_ab = extract_body_ab(body)
    face_ab = extract_face_ab(face)
    # 仅当双方都能解析为 a/b 时才进行限制
    if body_ab in ("a", "b") and face_ab in ("a", "b"):
        return body_ab == face_ab
    return True


class ComposerApp:
    def __init__(self, root: Tk, project_root: Path):
        self.root = root
        self.project_root = project_root
        self.imgs_root = project_root / "imgs"
        self.script_root = project_root / "script"

        self.mode_var = StringVar(value="script")  # script/free
        self.size_var = StringVar(value="z1")
        self.body_var = StringVar(value="")
        self.face_var = StringVar(value="")
        self.lock_ab_var = IntVar(value=1)
        self.export_dir_var = StringVar(value=str(project_root / "exports"))
        self.filter_var = StringVar(value="")

        self.script_combos: dict[str, list[Combo]] = {}
        self.assets: dict[str, dict[str, list[str]]] = {}
        self.current_combos: list[Combo] = []
        self.tk_preview = None
        self.listbox_index_to_combo: dict[int, Combo] = {}

        self._scan_assets()
        self._scan_script_combos()
        self._build_ui()
        self._refresh_controls_for_size()
        self._rebuild_combo_list(default_select=True)

    def _scan_assets(self) -> None:
        for size_dir in sorted([p.name for p in self.imgs_root.iterdir() if p.is_dir()]):
            files = [p.stem for p in (self.imgs_root / size_dir).glob("*.png")]
            bodies = sorted([x for x in files if BODY_RE.match(x)])
            faces = sorted([x for x in files if FACE_RE.match(x)])
            self.assets[size_dir] = {"bodies": bodies, "faces": faces}

        if self.size_var.get() not in self.assets:
            # 优先 no/z1/z2，最后兜底第一个
            for pref in ("z1", "no", "z2", "fa"):
                if pref in self.assets:
                    self.size_var.set(pref)
                    break
            else:
                self.size_var.set(next(iter(self.assets.keys()), ""))

    def _scan_script_combos(self) -> None:
        result: dict[str, set[Combo]] = {}
        if not self.script_root.exists():
            self.script_combos = {}
            return

        for ast in self.script_root.glob("*.ast"):
            try:
                content = ast.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for m in SCRIPT_FG_RE.finditer(content):
                size = m.group("size")
                body = m.group("file")
                face = m.group("face")
                if size not in result:
                    result[size] = set()
                result[size].add(Combo(size=size, body=body, face=face))

        self.script_combos = {k: sorted(v, key=lambda c: (c.body, c.face)) for k, v in result.items()}

    def _build_ui(self) -> None:
        self.root.title("Galgame 立绘拼接预览器")
        self.root.geometry("1300x840")

        main = PanedWindow(self.root, orient="horizontal")
        main.pack(fill=BOTH, expand=True)

        left = Frame(main, padx=8, pady=8)
        right = Frame(main, padx=8, pady=8)
        main.add(left, minsize=420)
        main.add(right)

        # Mode
        mode_frame = Frame(left)
        mode_frame.pack(fill="x")
        Label(mode_frame, text="组合模式").pack(anchor="w")
        Button(mode_frame, text="脚本组合", command=lambda: self._set_mode("script")).pack(side=LEFT, padx=2, pady=4)
        Button(mode_frame, text="自由组合", command=lambda: self._set_mode("free")).pack(side=LEFT, padx=2, pady=4)

        # Size
        size_frame = Frame(left)
        size_frame.pack(fill="x", pady=4)
        Label(size_frame, text="尺寸目录").pack(anchor="w")
        size_options = sorted(self.assets.keys())
        self.size_menu = OptionMenu(size_frame, self.size_var, *size_options, command=lambda _: self._on_size_change())
        self.size_menu.pack(fill="x")

        # Body / Face selectors
        pick_frame = Frame(left)
        pick_frame.pack(fill="x", pady=6)
        Label(pick_frame, text="身体").pack(anchor="w")
        self.body_menu = OptionMenu(pick_frame, self.body_var, "")
        self.body_menu.pack(fill="x")
        Label(pick_frame, text="脸部").pack(anchor="w")
        self.face_menu = OptionMenu(pick_frame, self.face_var, "")
        self.face_menu.pack(fill="x")

        Checkbutton(
            pick_frame,
            text="自由组合时锁定 a/b 前缀",
            variable=self.lock_ab_var,
            command=self._rebuild_combo_list,
        ).pack(anchor="w", pady=4)

        Button(pick_frame, text="预览手动选择组合", command=self._preview_manual_combo).pack(fill="x", pady=2)

        # Filter
        filter_frame = Frame(left)
        filter_frame.pack(fill="x", pady=4)
        Label(filter_frame, text="过滤 (输入 body 或 face 关键字)").pack(anchor="w")
        Entry(filter_frame, textvariable=self.filter_var).pack(fill="x")
        Button(filter_frame, text="应用过滤", command=self._rebuild_combo_list).pack(fill="x", pady=2)

        # Combo list
        list_frame = Frame(left)
        list_frame.pack(fill=BOTH, expand=True, pady=6)
        Label(list_frame, text="组合列表（默认脚本组合）").pack(anchor="w")
        self.combo_listbox = Listbox(list_frame, height=20)
        sb = Scrollbar(list_frame, orient=VERTICAL, command=self.combo_listbox.yview)
        self.combo_listbox.configure(yscrollcommand=sb.set)
        self.combo_listbox.pack(side=LEFT, fill=BOTH, expand=True)
        sb.pack(side=RIGHT, fill="y")
        self.combo_listbox.bind("<<ListboxSelect>>", lambda _: self._preview_selected_combo())

        # Export controls
        export_frame = Frame(left)
        export_frame.pack(fill="x", pady=4)
        Label(export_frame, text="导出目录").pack(anchor="w")
        Entry(export_frame, textvariable=self.export_dir_var).pack(fill="x")
        Button(export_frame, text="选择导出目录", command=self._choose_export_dir).pack(fill="x", pady=2)
        Button(export_frame, text="导出当前组合", command=self._export_current).pack(fill="x", pady=2)
        Button(export_frame, text="批量导出当前列表", command=self._export_all_current_list).pack(fill="x", pady=2)

        # Preview panel
        self.preview_label = Label(right, text="预览区", anchor="center")
        self.preview_label.pack(fill=BOTH, expand=True)
        self.info_label = Label(right, text="", anchor="w", justify=LEFT)
        self.info_label.pack(fill="x")

    def _set_mode(self, mode: str) -> None:
        if mode not in ("script", "free"):
            return
        self.mode_var.set(mode)
        self._rebuild_combo_list(default_select=True)

    def _on_size_change(self) -> None:
        self._refresh_controls_for_size()
        self._rebuild_combo_list(default_select=True)

    def _refresh_controls_for_size(self) -> None:
        size = self.size_var.get()
        data = self.assets.get(size, {"bodies": [], "faces": []})
        bodies = data["bodies"]
        faces = data["faces"]

        self._replace_option_menu(self.body_menu, self.body_var, bodies)
        self._replace_option_menu(self.face_menu, self.face_var, faces)

    @staticmethod
    def _replace_option_menu(menu_widget: OptionMenu, var: StringVar, values: list[str]) -> None:
        m = menu_widget["menu"]
        m.delete(0, "end")
        if not values:
            var.set("")
            m.add_command(label="", command=lambda: var.set(""))
            return
        var.set(values[0])
        for val in values:
            m.add_command(label=val, command=lambda v=val: var.set(v))

    def _rebuild_combo_list(self, default_select: bool = False) -> None:
        size = self.size_var.get()
        mode = self.mode_var.get()
        keyword = self.filter_var.get().strip().lower()

        combos: list[Combo] = []
        if mode == "script":
            combos = list(self.script_combos.get(size, []))
        else:
            data = self.assets.get(size, {"bodies": [], "faces": []})
            for body, face in product(data["bodies"], data["faces"]):
                if self.lock_ab_var.get() == 1:
                    # body 中的 a/b 组别必须和 face 的 a/b 一致
                    if not is_ab_compatible(body, face):
                        continue
                combos.append(Combo(size=size, body=body, face=face))

        # 检查文件存在
        valid = []
        for c in combos:
            bp = self.imgs_root / c.size / f"{c.body}.png"
            fp = self.imgs_root / c.size / f"{c.face}.png"
            if bp.exists() and fp.exists():
                valid.append(c)
        combos = valid

        if keyword:
            combos = [c for c in combos if keyword in c.body.lower() or keyword in c.face.lower()]

        combos = sorted(combos, key=lambda c: (c.body, c.face))
        self.current_combos = combos
        self._refresh_combo_listbox()
        if default_select and combos:
            self.combo_listbox.selection_clear(0, END)
            self.combo_listbox.selection_set(0)
            self.combo_listbox.activate(0)
            self._preview_selected_combo()

    def _refresh_combo_listbox(self) -> None:
        self.combo_listbox.delete(0, END)
        self.listbox_index_to_combo.clear()
        for i, c in enumerate(self.current_combos):
            self.combo_listbox.insert(END, c.label())
            self.listbox_index_to_combo[i] = c

    def _get_selected_combo(self) -> Combo | None:
        sel = self.combo_listbox.curselection()
        if not sel:
            return None
        idx = sel[0]
        return self.listbox_index_to_combo.get(idx)

    def _preview_selected_combo(self) -> None:
        c = self._get_selected_combo()
        if not c:
            return
        self._render_combo(c)

    def _preview_manual_combo(self) -> None:
        size = self.size_var.get()
        body = self.body_var.get().strip()
        face = self.face_var.get().strip()
        if not size or not body or not face:
            messagebox.showwarning("提示", "请先选择 size/body/face")
            return
        if self.mode_var.get() == "free" and self.lock_ab_var.get() == 1 and not is_ab_compatible(body, face):
            messagebox.showwarning("提示", "已启用 a/b 锁定，当前身体与表情组别不匹配")
            return
        c = Combo(size=size, body=body, face=face)
        self._render_combo(c)

    def _render_combo(self, combo: Combo) -> None:
        bp = self.imgs_root / combo.size / f"{combo.body}.png"
        fp = self.imgs_root / combo.size / f"{combo.face}.png"
        if not bp.exists() or not fp.exists():
            messagebox.showerror("错误", f"缺少文件:\n{bp}\n{fp}")
            return
        try:
            out = composite_images(bp, fp)
        except Exception as e:
            messagebox.showerror("错误", f"拼接失败: {e}")
            return

        # 预览窗口目标大小
        max_w, max_h = 840, 760
        scale = min(max_w / out.width, max_h / out.height, 1.0)
        view_w = max(1, int(out.width * scale))
        view_h = max(1, int(out.height * scale))
        preview = out.resize((view_w, view_h), Image.Resampling.LANCZOS)
        bg = create_checkerboard(view_w, view_h)
        bg.alpha_composite(preview)

        self.tk_preview = ImageTk.PhotoImage(bg)
        self.preview_label.configure(image=self.tk_preview, text="")
        self.info_label.configure(
            text=(
                f"当前: {combo.label()}\n"
                f"原始尺寸: {out.width}x{out.height}\n"
                f"输出文件名建议: {combo.out_name()}"
            )
        )
        self._last_render_combo = combo
        self._last_render_image = out

    def _choose_export_dir(self) -> None:
        p = filedialog.askdirectory(
            title="选择导出目录",
            initialdir=self.export_dir_var.get() if self.export_dir_var.get() else str(self.project_root),
        )
        if p:
            self.export_dir_var.set(p)

    def _ensure_export_dir(self) -> Path | None:
        p = Path(self.export_dir_var.get().strip())
        if not p:
            messagebox.showwarning("提示", "请先指定导出目录")
            return None
        try:
            p.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            messagebox.showerror("错误", f"无法创建导出目录: {e}")
            return None
        return p

    def _export_current(self) -> None:
        export_dir = self._ensure_export_dir()
        if not export_dir:
            return
        combo = getattr(self, "_last_render_combo", None)
        image = getattr(self, "_last_render_image", None)
        if combo is None or image is None:
            messagebox.showwarning("提示", "请先预览一个组合")
            return
        out = export_dir / combo.out_name()
        try:
            image.save(out)
            messagebox.showinfo("导出完成", f"已导出:\n{out}")
        except Exception as e:
            messagebox.showerror("错误", f"导出失败: {e}")

    def _export_all_current_list(self) -> None:
        export_dir = self._ensure_export_dir()
        if not export_dir:
            return
        if not self.current_combos:
            messagebox.showwarning("提示", "当前列表为空")
            return

        ok = messagebox.askyesno("确认", f"将导出 {len(self.current_combos)} 个组合到:\n{export_dir}\n继续吗？")
        if not ok:
            return

        success = 0
        failed = 0
        for c in self.current_combos:
            bp = self.imgs_root / c.size / f"{c.body}.png"
            fp = self.imgs_root / c.size / f"{c.face}.png"
            try:
                img = composite_images(bp, fp)
                img.save(export_dir / c.out_name())
                success += 1
            except Exception:
                failed += 1

        messagebox.showinfo("批量导出完成", f"成功: {success}\n失败: {failed}\n目录: {export_dir}")


def main() -> int:
    project_root = Path(__file__).resolve().parent
    if not (project_root / "imgs").exists():
        print("错误: 请将脚本放在包含 imgs/ 和 script/ 的项目根目录下运行。")
        return 1

    root = Tk()
    app = ComposerApp(root, project_root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())

import { Feather } from "@expo/vector-icons";
import React from "react";

export interface IconProps {
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}

type FeatherName = React.ComponentProps<typeof Feather>["name"];

function makeIcon(name: FeatherName): React.FC<IconProps> {
  return ({ size = 18, color = "#F4F4F5" }) => (
    <Feather name={name} size={size} color={color} />
  );
}

export const ArrowRight = makeIcon("arrow-right");
export const ArrowUp = makeIcon("arrow-up");
export const AudioWaveform = makeIcon("activity");
export const BookOpen = makeIcon("book-open");
export const Bookmark = makeIcon("bookmark");
export const Brain = makeIcon("cpu");
export const Check = makeIcon("check");
export const CheckCircle2 = makeIcon("check-circle");
export const ChevronDown = makeIcon("chevron-down");
export const ChevronUp = makeIcon("chevron-up");
export const Circle = makeIcon("circle");
export const Cloud = makeIcon("cloud");
export const Code2 = makeIcon("code");
export const Copy = makeIcon("copy");
export const Crown = makeIcon("award");
export const Download = makeIcon("download");
export const ExternalLink = makeIcon("external-link");
export const Eye = makeIcon("eye");
export const FileText = makeIcon("file-text");
export const Folder = makeIcon("folder");
export const FolderPlus = makeIcon("folder-plus");
export const Globe = makeIcon("globe");
export const Image = makeIcon("image");
export const KeyRound = makeIcon("key");
export const Library = makeIcon("layers");
export const Lock = makeIcon("lock");
export const LogOut = makeIcon("log-out");
export const Mail = makeIcon("mail");
export const Menu = makeIcon("menu");
export const MessageSquare = makeIcon("message-square");
export const Mic = makeIcon("mic");
export const Moon = makeIcon("moon");
export const Paperclip = makeIcon("paperclip");
export const Play = makeIcon("play");
export const Plus = makeIcon("plus");
export const Radio = makeIcon("radio");
export const RefreshCw = makeIcon("refresh-cw");
export const RotateCcw = makeIcon("rotate-ccw");
export const Search = makeIcon("search");
export const Send = makeIcon("send");
export const Settings = makeIcon("settings");
export const Share2 = makeIcon("share-2");
export const Shield = makeIcon("shield");
export const Smartphone = makeIcon("smartphone");
export const Sparkles = makeIcon("zap");
export const Square = makeIcon("square");
export const SquarePen = makeIcon("edit");
export const Sun = makeIcon("sun");
export const Trash2 = makeIcon("trash-2");
export const Upload = makeIcon("upload");
export const User = makeIcon("user");
export const Workflow = makeIcon("git-branch");
export const X = makeIcon("x");
export const XCircle = makeIcon("x-circle");

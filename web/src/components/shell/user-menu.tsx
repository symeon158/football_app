"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/game/avatar";
import { ACCOUNT_NAV } from "@/lib/navigation";

export function UserMenu({ name, username, level, avatarKey }: { name: string; username: string; level: number; avatarKey: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="relative flex size-9 items-center justify-center rounded-full ring-2 ring-background outline-none focus-visible:ring-ring"
      >
        <Avatar avatarKey={avatarKey} name={name} className="size-9" />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-gold px-1 text-[10px] font-black leading-4 text-black ring-2 ring-background">
          {level}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="font-semibold text-foreground">{name}</p>
            <p className="text-xs font-normal text-muted-foreground">@{username}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {ACCOUNT_NAV.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} render={<Link href={href} />}>
            <Icon />
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<button type="button" onClick={() => signOut()} className="w-full" />}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

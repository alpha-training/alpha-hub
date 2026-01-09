// src/utils/admin.js
export const ADMIN_EMAILS = [
    "kieran.lucid@alphakdb.com",
    "irina.pozdeeva@alphakdb.com"
  ];
  
  export function isAdmin(user) {
    if (!user || !user.email) return false;
    return ADMIN_EMAILS.includes(user.email.toLowerCase());
  }
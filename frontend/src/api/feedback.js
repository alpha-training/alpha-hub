// src/api/feedback.js
import { auth } from "../firebase";
import { FEEDBACK_API } from "../config";

// All feedback endpoints need the signed-in user's Firebase ID token
async function call(method, path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();

  const res = await fetch(`${FEEDBACK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.code = data?.error;
    throw err;
  }
  return data;
}

export const fetchProgress = () => call("GET", "/progress");
export const fetchAllProgress = () => call("GET", "/admin/progress");
export const revealSolution = (course, id) => call("POST", `/reveal/${course}/${id}`);
export const fetchSolution = (course, id) => call("GET", `/solution/${course}/${id}`);
export const fetchComparison = (username, course, id) =>
  call("GET", `/admin/compare/${username}/${course}/${id}`);
export const fetchFeedback = (course, id) => call("GET", `/feedback/${course}/${id}`);
// feedback: { commit, status, overall, files: [{ path, comment }] }
export const saveFeedback = (username, course, id, feedback) =>
  call("POST", `/admin/feedback/${username}/${course}/${id}`, feedback);

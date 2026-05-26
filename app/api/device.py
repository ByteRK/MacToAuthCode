import json

from flask import Blueprint, current_app, jsonify, request


device_bp = Blueprint("device", __name__)


@device_bp.post("/api/device/authorize")
def authorize_device():
    payload = request.get_json(silent=True) or {}
    client_ip = request.remote_addr
    request_access_policy_service = current_app.extensions["request_access_policy_service"]
    if not request_access_policy_service.is_allowed(client_ip):
        repository = current_app.extensions["auth_code_repository"]
        pid = str(payload.get("pid", "")).strip() or "-"
        mac = str(payload.get("mac", "")).strip() or "-"
        payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True) if payload else None
        with repository.database.connection() as conn:
            repository.log_distribution(
                conn,
                pid=pid,
                mac=mac,
                action="denied",
                message="请求 IP 不在白名单内",
                client_ip=client_ip,
                payload_json=payload_json,
            )
        return jsonify({"success": False, "message": "当前请求 IP 不在白名单内"}), 403

    mac = str(payload.get("mac", "")).strip()
    pid = str(payload.get("pid", "")).strip()
    if not mac:
        return jsonify({"success": False, "message": "请求体缺少 mac 字段"}), 400
    if not pid:
        return jsonify({"success": False, "message": "请求体缺少 pid 字段"}), 400

    service = current_app.extensions["auth_code_service"]
    try:
        body, status = service.distribute_code(mac, pid, client_ip)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400

    return jsonify(body), status

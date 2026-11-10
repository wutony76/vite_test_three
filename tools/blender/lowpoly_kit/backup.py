"""破壞性操作前的備份與還原。

做法：把 Object 目前的 Mesh data 複製一份，設 fake user 讓它即使沒有 Object
使用也不會在存檔時被 Blender 清掉，而且不連結到場景，所以畫面上看不到。
還原時把 Object 的 data 換回備份即可，Object 本身（名稱、位置、父子關係）不受影響。

Boolean 用掉的其他 Object 不直接刪除，而是移到不連結場景的 `LowpolyKit_Backup`
collection，需要時再把它連回場景就能找回。
"""

import bpy

BACKUP_TAG = "__backup_"
BACKUP_COLLECTION = "LowpolyKit_Backup"


def backup_mesh(obj):
    prefix = f"{obj.name}{BACKUP_TAG}"
    index = 1 + sum(1 for mesh in bpy.data.meshes if mesh.name.startswith(prefix))
    copy = obj.data.copy()
    copy.name = f"{prefix}{index}"
    # fake user：沒有任何 Object 使用時仍保留；少了它，存檔重開後備份就消失
    copy.use_fake_user = True
    return copy


def restore_mesh(obj, backup):
    """把 obj 的 mesh 換回 backup，並刪掉改壞的那份。"""
    broken = obj.data
    original_name = broken.name
    obj.data = backup
    backup.use_fake_user = False
    if broken.users == 0:
        bpy.data.meshes.remove(broken)
    # 先刪掉壞的再改名，才拿得回原本的名字（否則會變成 xxx.001）
    backup.name = original_name


def swap_mesh(obj, new_mesh):
    """用 new_mesh 取代 obj.data，沿用原本的 mesh 名稱。"""
    old = obj.data
    name = old.name
    obj.data = new_mesh
    if old.users == 0:
        bpy.data.meshes.remove(old)
    new_mesh.name = name


def drop_backup(backup):
    if backup is not None and backup.name in bpy.data.meshes:
        bpy.data.meshes.remove(backup)


def clear_backups(obj):
    """刪除 obj 的所有備份 mesh，回傳刪除數量。"""
    prefix = f"{obj.name}{BACKUP_TAG}"
    targets = [m for m in bpy.data.meshes if m.name.startswith(prefix) and m.users <= 1]
    for mesh in targets:
        bpy.data.meshes.remove(mesh)
    return len(targets)


def stash_object(obj):
    """把用過的 Object 移出場景，放進備份 collection（不刪除，可找回）。"""
    collection = bpy.data.collections.get(BACKUP_COLLECTION)
    if collection is None:
        collection = bpy.data.collections.new(BACKUP_COLLECTION)
    # 解除父子關係並保留世界座標；少了這步，它還會出現在原本 root 的 children 裡
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return collection.name

# Proposal

## 變更名稱

`add-project-room-style` — projectRoom 參考 mainHall（龍兔的家）的風格改版

## 背景

使用者要求 projectRoom 參考 mainHall 的風格，在不改佈局結構的前提下改動建築的風格元素，先做一版看效果。過程中陸續補充：

1. 顏色要和 mainHall 有區別，不用一樣。
2. 第三層不要都是黃色；側面要有變化，不要看起來像長方體。
3. 第二層右邊凸出的方盒改成圓的，顏色和主體區分。
4. 底部和背面看起來單薄，要補全。

## 目標

- 新增 `projectRoomStyle.ts`：只換材質顏色、加裝飾，不改 `project_room.glb`，所以可以隨時開關比較。
- 面板「projectRoom 香菇屋風格 → 套用香菇屋風格」開關。預設開啟，讓使用者直接看到效果；關掉就是原樣。

## 範圍

- `src/world/objects/projectRoomStyle.ts`（新）
- `src/world/objects/obj.ts`：`attachHouseModel` 的 onLoaded 建立風格，在 update 裡更新動畫，並交出設定。
- `src/world/main.ts`：面板開關。
- 不包含：重建 project_room 的 Blender 模型。

## 成功標準

- [x] 配色和 mainHall 有區別；第三層、圓塔、側面凸窗與塔樓、背面窗戶、寬石台都出現。
- [x] 關掉開關後完全回到原本的樣子（顏色、紅色方盒、窗戶位置）。
- [x] console 沒有 error，`npm run build` 通過。

<table class="items">
    <thead>
        <tr>
            <th>#</th><th>Product</th>@if($isSale)<th>Batch</th>@endif
            <th class="num">Qty</th><th class="num">Bonus</th><th class="num">Price</th>
            <th class="num">Discount</th><th class="num">GST</th><th class="num">Net</th>
        </tr>
    </thead>
    <tbody>
        @foreach($document->items as $i => $item)
            @php
                $lineGross = round((float) $item->quantity * (float) $item->trade_price, 2);
                $discount = (float) $item->discount_amount;
                $discPct = $lineGross > 0 ? $discount / $lineGross * 100 : 0;
                $decimal = static fn ($number) => rtrim(rtrim(number_format((float) $number, 2, '.', ','), '0'), '.');
            @endphp
            <tr>
                <td>{{ $i + 1 }}</td>
                <td>
                    <strong>{{ $item->product?->name ?? 'Product #'.$item->product_id }}</strong>
                    @if($isSale && $item->product?->company)<br><span class="meta">{{ $item->product->company->name }}</span>@endif
                    @foreach($item->incentives as $award)
                        <br><span class="meta">{{ $award->rule_name }}
                            @if(in_array($award->rule_type, ['qty_bonus', 'slab_bonus'], true) && (float) $award->bonus_qty > 0)
                                · +{{ $decimal($award->bonus_qty) }} bonus
                            @elseif($award->rule_type === 'price_override' && $award->trade_price !== null)
                                · Rs {{ number_format((float) $award->trade_price, 2) }} each
                            @endif
                        </span>
                    @endforeach
                    @if($item->remarks)<br><span class="meta">{{ $item->remarks }}</span>@endif
                </td>
                @if($isSale)<td>{{ $item->batch?->batch_number ?? 'FIFO' }}</td>@endif
                <td class="num">{{ $decimal($item->quantity) }}</td>
                <td class="num">{{ $decimal($isSale ? $item->bonus_quantity : $item->requested_bonus) }}</td>
                <td class="num">{{ number_format((float) $item->trade_price, 2) }}</td>
                <td class="num">{{ number_format($discount, 2) }}@if($discount > 0)<br><span class="meta">{{ $decimal($discPct) }}%</span>@endif</td>
                <td class="num">{{ number_format((float) $item->gst_amount, 2) }}@if((float) $item->gst_amount > 0)<br><span class="meta">{{ $decimal($item->gst_percent) }}%</span>@endif</td>
                <td class="num">{{ number_format((float) $item->net_amount, 2) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>
